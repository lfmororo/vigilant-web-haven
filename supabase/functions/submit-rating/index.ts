import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // GET: render rating page
  if (req.method === "GET") {
    const url = new URL(req.url);
    const token = url.searchParams.get("token");
    const rating = url.searchParams.get("rating");

    if (!token) {
      return new Response("Token inválido.", { status: 400, headers: { "Content-Type": "text/html; charset=utf-8" } });
    }

    // Check if rating already exists
    const { data: existing } = await supabaseAdmin
      .from("ticket_ratings")
      .select("id, rating, comment, ticket_id")
      .eq("rating_token", token)
      .maybeSingle();

    if (!existing) {
      return new Response(buildHtmlPage("Erro", "Link de avaliação inválido ou expirado.", "", false), {
        status: 404, headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    // If already rated (rating is not null means it was submitted)
    if (existing.rating !== null) {
      return new Response(buildHtmlPage("Obrigado!", "Sua avaliação já foi registrada. Agradecemos o seu feedback!", `Nota: ${existing.rating}/10`, false), {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    // Show rating form with pre-selected score
    const selectedRating = rating ? parseInt(rating) : 0;
    return new Response(buildRatingForm(token, selectedRating, existing.ticket_id), {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  // POST: submit rating
  if (req.method === "POST") {
    try {
      const formData = await req.formData();
      const token = formData.get("token") as string;
      const ratingStr = formData.get("rating") as string;
      const comment = formData.get("comment") as string || "";

      const ratingNum = parseInt(ratingStr);
      if (!token || isNaN(ratingNum) || ratingNum < 1 || ratingNum > 10) {
        return new Response(buildHtmlPage("Erro", "Dados inválidos.", "", false), {
          status: 400, headers: { "Content-Type": "text/html; charset=utf-8" },
        });
      }

      // Check token exists and not yet rated
      const { data: existing } = await supabaseAdmin
        .from("ticket_ratings")
        .select("id, rating")
        .eq("rating_token", token)
        .maybeSingle();

      if (!existing) {
        return new Response(buildHtmlPage("Erro", "Link inválido ou expirado.", "", false), {
          status: 404, headers: { "Content-Type": "text/html; charset=utf-8" },
        });
      }

      if (existing.rating !== null) {
        return new Response(buildHtmlPage("Obrigado!", "Sua avaliação já foi registrada anteriormente.", `Nota: ${existing.rating}/10`, false), {
          headers: { "Content-Type": "text/html; charset=utf-8" },
        });
      }

      // Save rating
      const sanitizedComment = comment.substring(0, 1000).trim();
      await supabaseAdmin
        .from("ticket_ratings")
        .update({ rating: ratingNum, comment: sanitizedComment || null, rated_at: new Date().toISOString(), rating_source: "email" })
        .eq("id", existing.id);

      const emoji = ratingNum >= 8 ? "🎉" : ratingNum >= 5 ? "👍" : "😔";
      return new Response(
        buildHtmlPage("Obrigado pelo seu feedback!", `${emoji} Sua avaliação de ${ratingNum}/10 foi registrada com sucesso.`, sanitizedComment ? `Comentário: "${sanitizedComment}"` : "", true),
        { headers: { "Content-Type": "text/html; charset=utf-8" } }
      );
    } catch (error) {
      console.error("submit-rating POST error:", error);
      return new Response(buildHtmlPage("Erro", "Ocorreu um erro ao processar sua avaliação.", "", false), {
        status: 500, headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }
  }

  return new Response("Method not allowed", { status: 405 });
});

function buildHtmlPage(title: string, message: string, detail: string, success: boolean): string {
  const color = success ? "#16a34a" : "#dc2626";
  const bg = success ? "#f0fdf4" : "#fef2f2";
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:'Segoe UI',Arial,sans-serif; background:#f1f5f9; display:flex; align-items:center; justify-content:center; min-height:100vh; padding:20px; }
  .card { background:#fff; border-radius:16px; padding:40px; max-width:500px; width:100%; text-align:center; box-shadow:0 4px 24px rgba(0,0,0,0.08); }
  .icon { font-size:48px; margin-bottom:16px; }
  h1 { color:${color}; font-size:24px; margin-bottom:12px; }
  .msg { color:#475569; font-size:16px; line-height:1.6; margin-bottom:16px; }
  .detail { background:${bg}; border-radius:8px; padding:12px 16px; color:#334155; font-size:14px; font-style:italic; }
</style></head><body>
<div class="card">
  <div class="icon">${success ? "✅" : "⚠️"}</div>
  <h1>${title}</h1>
  <p class="msg">${message}</p>
  ${detail ? `<div class="detail">${detail}</div>` : ""}
</div>
</body></html>`;
}

function buildRatingForm(token: string, selectedRating: number, ticketId: string): string {
  const functionUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/submit-rating`;
  
  const ratingButtons = Array.from({ length: 10 }, (_, i) => {
    const n = i + 1;
    const isSelected = n === selectedRating;
    let color = "#dc2626"; // 1-3 red
    if (n >= 4 && n <= 6) color = "#d97706"; // 4-6 amber
    if (n >= 7 && n <= 8) color = "#2563eb"; // 7-8 blue
    if (n >= 9) color = "#16a34a"; // 9-10 green
    const selectedStyle = isSelected ? `background:${color};color:#fff;transform:scale(1.15);box-shadow:0 4px 14px ${color}44;` : `background:#f8fafc;color:${color};border:2px solid ${color};`;
    return `<button type="button" class="rating-btn" data-value="${n}" style="${selectedStyle}" onclick="selectRating(${n})">${n}</button>`;
  }).join("");

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Avaliação de Atendimento</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:'Segoe UI',Arial,sans-serif; background:#f1f5f9; display:flex; align-items:center; justify-content:center; min-height:100vh; padding:20px; }
  .card { background:#fff; border-radius:16px; padding:40px; max-width:560px; width:100%; box-shadow:0 4px 24px rgba(0,0,0,0.08); }
  .header { text-align:center; margin-bottom:24px; }
  .header .icon { font-size:48px; }
  h1 { color:#1e293b; font-size:22px; margin:12px 0 4px; }
  .sub { color:#64748b; font-size:14px; }
  .ratings { display:flex; gap:8px; justify-content:center; flex-wrap:wrap; margin:24px 0; }
  .rating-btn { width:44px; height:44px; border-radius:12px; font-size:16px; font-weight:700; cursor:pointer; border:none; transition:all 0.2s; }
  .rating-btn:hover { transform:scale(1.1); }
  .labels { display:flex; justify-content:space-between; margin:-8px 0 24px; padding:0 8px; }
  .labels span { font-size:11px; color:#94a3b8; }
  textarea { width:100%; border:2px solid #e2e8f0; border-radius:12px; padding:14px; font-size:14px; resize:vertical; min-height:80px; font-family:inherit; transition:border-color 0.2s; }
  textarea:focus { outline:none; border-color:#2563eb; }
  .submit-btn { width:100%; padding:14px; background:linear-gradient(135deg,#2563eb,#7c3aed); color:#fff; border:none; border-radius:12px; font-size:16px; font-weight:700; cursor:pointer; margin-top:16px; transition:opacity 0.2s; }
  .submit-btn:hover { opacity:0.9; }
  .submit-btn:disabled { opacity:0.5; cursor:not-allowed; }
  label { display:block; font-size:14px; font-weight:600; color:#334155; margin-bottom:8px; }
</style></head><body>
<div class="card">
  <div class="header">
    <div class="icon">⭐</div>
    <h1>Avaliação de Atendimento</h1>
    <p class="sub">Como você avalia o atendimento recebido?</p>
  </div>
  <form method="POST" action="${functionUrl}">
    <input type="hidden" name="token" value="${token}" />
    <input type="hidden" name="rating" id="rating-input" value="${selectedRating || ''}" />
    <label>Sua nota</label>
    <div class="ratings">${ratingButtons}</div>
    <div class="labels"><span>Péssimo</span><span>Excelente</span></div>
    <label>Comentário (opcional)</label>
    <textarea name="comment" placeholder="Conte-nos mais sobre sua experiência..." maxlength="1000"></textarea>
    <button type="submit" class="submit-btn" id="submit-btn" ${selectedRating ? '' : 'disabled'}>Enviar Avaliação</button>
  </form>
</div>
<script>
function selectRating(n) {
  document.getElementById('rating-input').value = n;
  document.getElementById('submit-btn').disabled = false;
  document.querySelectorAll('.rating-btn').forEach(btn => {
    const v = parseInt(btn.dataset.value);
    let color = '#dc2626';
    if (v >= 4 && v <= 6) color = '#d97706';
    if (v >= 7 && v <= 8) color = '#2563eb';
    if (v >= 9) color = '#16a34a';
    if (v === n) {
      btn.style.background = color;
      btn.style.color = '#fff';
      btn.style.transform = 'scale(1.15)';
      btn.style.boxShadow = color + '44 0 4px 14px';
      btn.style.border = 'none';
    } else {
      btn.style.background = '#f8fafc';
      btn.style.color = color;
      btn.style.transform = 'scale(1)';
      btn.style.boxShadow = 'none';
      btn.style.border = '2px solid ' + color;
    }
  });
}
</script>
</body></html>`;
}
