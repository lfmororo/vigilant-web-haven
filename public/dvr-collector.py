#!/usr/bin/env python3
"""
DVR Intelbras Collector (PyIntelbras)
=====================================
Monitora DVRs Intelbras via API CGI usando pyintelbras.
Coleta: status (ping), gravação, disco, canais, eventos.

Requisitos:
  pip install pyintelbras requests ping3

Uso:
  python3 dvr-collector.py
"""

import json
import time
import logging
import urllib3
from datetime import datetime

import requests
from ping3 import ping

# Tentar importar pyintelbras
try:
    from pyintelbras import IntelbrasAPI
except ImportError:
    print("ERRO: pyintelbras não instalado. Execute: pip install pyintelbras")
    exit(1)

# Desabilitar warnings de SSL (DVRs usam certificados auto-assinados)
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# ============== CONFIGURAÇÃO ==============
SUPABASE_URL = "https://egbusmegupjfxqswdlxq.supabase.co"
SUPABASE_ANON_KEY = "COLE_SUA_ANON_KEY_AQUI"
POLL_INTERVAL = 60  # segundos
# ==========================================

logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger(__name__)


def supabase_headers():
    return {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {SUPABASE_ANON_KEY}",
        "apikey": SUPABASE_ANON_KEY,
    }


def fetch_dvrs():
    """Busca DVRs ativos do banco."""
    try:
        url = (
            f"{SUPABASE_URL}/rest/v1/dvr_devices"
            "?is_active=eq.true"
            "&select=id,name,host,port,username,password,"
            "dvr_cameras(id,name,channel,rtsp_url)"
        )
        resp = requests.get(url, headers=supabase_headers(), timeout=15)
        resp.raise_for_status()
        return resp.json()
    except Exception as e:
        log.error(f"Erro ao buscar DVRs: {e}")
        return []


def check_ping(host: str) -> bool:
    """Verifica se o host responde a ping."""
    try:
        result = ping(host, timeout=3)
        return result is not None and result is not False
    except Exception:
        return False


def collect_dvr(dvr: dict) -> dict:
    """Coleta dados completos de um DVR via pyintelbras."""
    dvr_id = dvr["id"]
    name = dvr["name"]
    host = dvr["host"]
    port = dvr.get("port", 80)
    username = dvr.get("username", "admin")
    password = dvr.get("password", "")

    log.info(f"📡 Coletando: {name} ({host}:{port})")

    result = {
        "dvr_id": dvr_id,
        "status": "offline",
        "error": None,
        "cameras": [],
        "disk": None,
        "device_info": None,
    }

    # 1. Ping check
    online = check_ping(host)
    if not online:
        result["error"] = "Host não respondeu ao ping"
        log.info(f"  ❌ {name}: Offline (ping falhou)")
        return result

    result["status"] = "online"

    # 2. Tentar conectar via API CGI (pyintelbras)
    try:
        base_url = f"http://{host}:{port}"
        api = IntelbrasAPI(base_url)
        api.login(username, password)
        log.info(f"  🔑 API conectada")

        # 2a. Informações do dispositivo
        try:
            device_info = {}

            # Tentar obter informações do sistema
            try:
                sys_info = api.get("magicBox.cgi?action=getSystemInfo")
                if hasattr(sys_info, "text"):
                    for line in sys_info.text.strip().split("\n"):
                        if "=" in line:
                            k, v = line.split("=", 1)
                            device_info[k.strip()] = v.strip()
            except Exception:
                pass

            # Tentar obter versão de software
            try:
                sw_info = api.get("magicBox.cgi?action=getSoftwareVersion")
                if hasattr(sw_info, "text"):
                    for line in sw_info.text.strip().split("\n"):
                        if "=" in line:
                            k, v = line.split("=", 1)
                            device_info[k.strip()] = v.strip()
            except Exception:
                pass

            # Tentar obter serial
            try:
                sn_info = api.get("magicBox.cgi?action=getSerialNo")
                if hasattr(sn_info, "text"):
                    for line in sn_info.text.strip().split("\n"):
                        if "=" in line:
                            k, v = line.split("=", 1)
                            device_info[k.strip()] = v.strip()
            except Exception:
                pass

            # Tentar obter uptime
            try:
                uptime_info = api.get("magicBox.cgi?action=getUpTime")
                if hasattr(uptime_info, "text"):
                    for line in uptime_info.text.strip().split("\n"):
                        if "=" in line:
                            k, v = line.split("=", 1)
                            device_info[k.strip()] = v.strip()
            except Exception:
                pass

            result["device_info"] = {
                "model": device_info.get("deviceType", device_info.get("model", None)),
                "firmware": device_info.get("version", device_info.get("softwareVersion", None)),
                "serial": device_info.get("serialNo", device_info.get("sn", None)),
                "uptime_seconds": _parse_uptime(device_info.get("info.UpTime", None)),
            }
            log.info(f"  📋 Modelo: {result['device_info'].get('model', '?')}")
        except Exception as e:
            log.warning(f"  ⚠ Info do dispositivo: {e}")

        # 2b. Informações de disco (HD)
        try:
            disk_data = _collect_disk_info(api)
            if disk_data:
                result["disk"] = disk_data
                log.info(
                    f"  💾 Disco: {disk_data.get('used_gb', 0):.1f}/"
                    f"{disk_data.get('total_gb', 0):.1f} GB "
                    f"({disk_data.get('usage_pct', 0):.1f}%)"
                )
        except Exception as e:
            log.warning(f"  ⚠ Info de disco: {e}")

        # 2c. Status dos canais / câmeras
        try:
            channels_info = _collect_channels(api, dvr)
            result["cameras"] = channels_info
            recording_count = sum(1 for c in channels_info if c.get("recording_status") == "recording")
            log.info(f"  📹 {len(channels_info)} canais ({recording_count} gravando)")
        except Exception as e:
            log.warning(f"  ⚠ Info de canais: {e}")
            # Fallback: manter status antigo baseado em RTSP
            for cam in dvr.get("dvr_cameras", []):
                result["cameras"].append({
                    "camera_id": cam["id"],
                    "status": "unknown",
                })

        # 2d. Detecção de eventos (motion, video loss)
        try:
            _collect_events(api, result)
        except Exception as e:
            log.warning(f"  ⚠ Detecção de eventos: {e}")

    except Exception as e:
        log.warning(f"  ⚠ API indisponível, verificando via ping apenas: {e}")
        # Se API falhou mas ping OK, marcar online sem detalhes
        for cam in dvr.get("dvr_cameras", []):
            result["cameras"].append({
                "camera_id": cam["id"],
                "status": "unknown",
            })

    return result


def _parse_uptime(value):
    """Parse uptime em segundos a partir de string."""
    if not value:
        return None
    try:
        return int(value)
    except (ValueError, TypeError):
        return None


def _collect_disk_info(api) -> dict | None:
    """Coleta informações de disco via API CGI."""
    try:
        resp = api.get("storageDevice.cgi?action=factory.getCollect")
        if not hasattr(resp, "text"):
            return None

        disks = []
        current_disk = {}

        for line in resp.text.strip().split("\n"):
            if "=" not in line:
                continue
            key, val = line.split("=", 1)
            key = key.strip()
            val = val.strip()

            if "TotalBytes" in key:
                current_disk["total"] = int(val) if val.isdigit() else 0
            elif "UsedBytes" in key:
                current_disk["used"] = int(val) if val.isdigit() else 0
            elif "FreeBytes" in key or "RemainBytes" in key:
                current_disk["free"] = int(val) if val.isdigit() else 0
            elif "State" in key or "status" in key.lower():
                current_disk["state"] = val

            # Se temos total, é um disco completo
            if "total" in current_disk and current_disk["total"] > 0:
                if "used" in current_disk or "free" in current_disk:
                    disks.append(current_disk.copy())
                    current_disk = {}

        if not disks:
            # Tentar método alternativo
            resp2 = api.get("configManager.cgi?action=getConfig&name=StorageGlobal")
            if hasattr(resp2, "text"):
                for line in resp2.text.strip().split("\n"):
                    if "=" not in line:
                        continue
                    key, val = line.split("=", 1)
                    key = key.strip()
                    val = val.strip()
                    if "TotalSpace" in key:
                        current_disk["total"] = int(float(val)) if val else 0
                    elif "UsedSpace" in key:
                        current_disk["used"] = int(float(val)) if val else 0
                if "total" in current_disk:
                    disks.append(current_disk)

        if not disks:
            return None

        # Somar todos os discos
        total_bytes = sum(d.get("total", 0) for d in disks)
        used_bytes = sum(d.get("used", 0) for d in disks)
        free_bytes = sum(d.get("free", 0) for d in disks)

        if free_bytes == 0 and total_bytes > 0 and used_bytes > 0:
            free_bytes = total_bytes - used_bytes
        if used_bytes == 0 and total_bytes > 0 and free_bytes > 0:
            used_bytes = total_bytes - free_bytes

        total_gb = total_bytes / (1024 ** 3) if total_bytes > 1000000 else total_bytes / 1024
        used_gb = used_bytes / (1024 ** 3) if used_bytes > 1000000 else used_bytes / 1024
        free_gb = free_bytes / (1024 ** 3) if free_bytes > 1000000 else free_bytes / 1024

        usage_pct = (used_gb / total_gb * 100) if total_gb > 0 else 0

        return {
            "total_gb": round(total_gb, 2),
            "used_gb": round(used_gb, 2),
            "free_gb": round(free_gb, 2),
            "usage_pct": round(usage_pct, 1),
        }

    except Exception:
        return None


def _collect_channels(api, dvr: dict) -> list:
    """Coleta informações detalhadas dos canais."""
    cameras = dvr.get("dvr_cameras", [])
    results = []

    # Tentar obter lista de canais da API
    try:
        api_channels = api.channels
    except Exception:
        api_channels = None

    # Tentar obter status de gravação
    recording_statuses = {}
    try:
        resp = api.get("recordManager.cgi?action=getState")
        if hasattr(resp, "text"):
            for line in resp.text.strip().split("\n"):
                if "=" not in line:
                    continue
                key, val = line.split("=", 1)
                # key like: status[0]=1 means channel 0 recording
                if "status" in key.lower():
                    try:
                        idx = int(key.split("[")[1].split("]")[0])
                        recording_statuses[idx] = val.strip() == "1"
                    except (IndexError, ValueError):
                        pass
    except Exception:
        pass

    # Tentar obter config de encode (resolução, codec, FPS)
    encode_configs = {}
    try:
        resp = api.get("configManager.cgi?action=getConfig&name=Encode")
        if hasattr(resp, "text"):
            current_ch = None
            current_config = {}
            for line in resp.text.strip().split("\n"):
                if "=" not in line:
                    continue
                key, val = line.split("=", 1)
                key = key.strip()
                val = val.strip()

                # Detect channel index
                if "table.Encode[" in key:
                    try:
                        idx = int(key.split("[")[1].split("]")[0])
                        if idx != current_ch:
                            if current_ch is not None:
                                encode_configs[current_ch] = current_config.copy()
                            current_ch = idx
                            current_config = {}
                    except (IndexError, ValueError):
                        pass

                if "Resolution" in key and "MainFormat" in key:
                    current_config["resolution"] = val
                elif "Compression" in key and "MainFormat" in key:
                    current_config["codec"] = val
                elif "FPS" in key and "MainFormat" in key:
                    try:
                        current_config["fps"] = int(val)
                    except ValueError:
                        pass

            if current_ch is not None:
                encode_configs[current_ch] = current_config
    except Exception:
        pass

    # Mapear para câmeras cadastradas
    for cam in cameras:
        channel_idx = cam["channel"] - 1  # API usa base 0
        cam_result = {
            "camera_id": cam["id"],
            "status": "online",  # Se API conectou, canais devem estar acessíveis
            "recording_status": "recording" if recording_statuses.get(channel_idx, False) else "not_recording",
        }

        # Adicionar info de encode
        enc = encode_configs.get(channel_idx, {})
        if enc:
            cam_result["resolution"] = enc.get("resolution")
            cam_result["codec"] = enc.get("codec")
            cam_result["fps"] = enc.get("fps")

        # Nome do canal da API
        if api_channels and channel_idx < len(api_channels):
            ch_info = api_channels[channel_idx]
            if isinstance(ch_info, dict):
                cam_result["camera_type"] = ch_info.get("Type", None)

        results.append(cam_result)

    return results


def _collect_events(api, result: dict):
    """Verifica detecção de movimento e perda de vídeo nos canais."""
    cameras = result.get("cameras", [])

    # Tentar obter status de video loss
    try:
        resp = api.get("videoInput.cgi?action=getVideoLoss")
        if hasattr(resp, "text"):
            for line in resp.text.strip().split("\n"):
                if "=" not in line:
                    continue
                key, val = line.split("=", 1)
                if "status" in key.lower():
                    try:
                        idx = int(key.split("[")[1].split("]")[0])
                        is_loss = val.strip() == "1"
                        for cam in cameras:
                            # Match by position (approximate)
                            cam["video_loss"] = is_loss
                            if is_loss:
                                cam["status"] = "offline"
                    except (IndexError, ValueError):
                        pass
    except Exception:
        pass

    # Tentar obter status de motion detect
    try:
        resp = api.get("motionDetect.cgi?action=getState")
        if hasattr(resp, "text"):
            for line in resp.text.strip().split("\n"):
                if "=" not in line:
                    continue
                key, val = line.split("=", 1)
                if "status" in key.lower():
                    try:
                        idx = int(key.split("[")[1].split("]")[0])
                        is_motion = val.strip() == "1"
                        for cam in cameras:
                            cam["motion_detect"] = is_motion
                    except (IndexError, ValueError):
                        pass
    except Exception:
        pass


def send_data(dvrs_data: list):
    """Envia dados coletados para a Edge Function."""
    try:
        resp = requests.post(
            f"{SUPABASE_URL}/functions/v1/dvr-vps-ingest",
            json={"dvrs": dvrs_data},
            headers=supabase_headers(),
            timeout=30,
        )
        resp.raise_for_status()
        log.info(f"✅ Dados enviados com sucesso.")
    except Exception as e:
        log.error(f"❌ Erro ao enviar dados: {e}")


def monitor():
    """Ciclo principal de monitoramento."""
    log.info("🔍 Monitorando DVRs...")

    dvr_list = fetch_dvrs()
    if not dvr_list:
        log.info("Nenhum DVR ativo encontrado.")
        return

    log.info(f"{len(dvr_list)} DVR(s) encontrado(s)")

    results = []
    for dvr in dvr_list:
        data = collect_dvr(dvr)
        results.append(data)

    send_data(results)
    log.info("=== Ciclo finalizado ===\n")


if __name__ == "__main__":
    log.info("🚀 DVR Intelbras Collector (PyIntelbras) iniciado")
    log.info(f"Intervalo: {POLL_INTERVAL}s")

    while True:
        try:
            monitor()
        except Exception as e:
            log.error(f"Erro no ciclo: {e}")
        time.sleep(POLL_INTERVAL)
