package main

import (
	"bytes"
	"image"
	"image/color"
	"image/draw"
	_ "image/jpeg"
	"image/png"
	"os"
	"strings"

	"golang.org/x/image/bmp"
	xdraw "golang.org/x/image/draw"
	"golang.org/x/image/font"
	"golang.org/x/image/font/gofont/gobold"
	"golang.org/x/image/font/gofont/goregular"
	"golang.org/x/image/font/opentype"
	"golang.org/x/image/math/fixed"
)

// Desenho do papel de parede (separado para poder ser testado fora do Windows).

// ---------------------------------------------------------------- desenho

var (
	navy  = color.RGBA{0x0B, 0x1F, 0x44, 0xFF}
	cyan  = color.RGBA{0x00, 0xB8, 0xD9, 0xFF}
	gray  = color.RGBA{0x4A, 0x55, 0x68, 0xFF}
	panel = color.NRGBA{0xFF, 0xFF, 0xFF, 0xEB}
)

func loadImage(path string) image.Image {
	f, err := os.Open(path)
	if err != nil {
		return nil
	}
	defer f.Close()
	img, _, err := image.Decode(f)
	if err != nil {
		if _, err2 := f.Seek(0, 0); err2 == nil {
			if b, err3 := bmp.Decode(f); err3 == nil {
				return b
			}
		}
		return nil
	}
	return img
}

func newFace(ttf []byte, size float64) font.Face {
	f, _ := opentype.Parse(ttf)
	face, _ := opentype.NewFace(f, &opentype.FaceOptions{Size: size, DPI: 72, Hinting: font.HintingFull})
	return face
}

func textWidth(face font.Face, s string) int {
	return font.MeasureString(face, s).Ceil()
}

func drawText(dst draw.Image, face font.Face, x, y int, c color.Color, s string) {
	d := &font.Drawer{Dst: dst, Src: image.NewUniform(c), Face: face, Dot: fixed.P(x, y)}
	d.DrawString(s)
}

// fillRounded pinta um retângulo de cantos arredondados (cor não pré-multiplicada).
func fillRounded(dst draw.Image, r image.Rectangle, rad int, c color.NRGBA) {
	mask := image.NewAlpha(image.Rect(0, 0, r.Dx(), r.Dy()))
	w, h := r.Dx(), r.Dy()
	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			dx, dy := 0, 0
			if x < rad {
				dx = rad - x
			} else if x >= w-rad {
				dx = x - (w - rad - 1)
			}
			if y < rad {
				dy = rad - y
			} else if y >= h-rad {
				dy = y - (h - rad - 1)
			}
			if dx*dx+dy*dy <= rad*rad {
				mask.Pix[y*mask.Stride+x] = 0xFF
			}
		}
	}
	draw.DrawMask(dst, r, image.NewUniform(c), image.Point{}, mask, image.Point{}, draw.Over)
}

func renderWallpaper(st *DesktopState, user, orig string, w, h int) image.Image {
	dst := image.NewRGBA(image.Rect(0, 0, w, h))
	if bg := loadImage(orig); bg != nil {
		// Preenche a tela mantendo a proporção (corta as sobras).
		b := bg.Bounds()
		scale := float64(w) / float64(b.Dx())
		if s := float64(h) / float64(b.Dy()); s > scale {
			scale = s
		}
		sw, sh := int(float64(b.Dx())*scale), int(float64(b.Dy())*scale)
		off := image.Pt((w-sw)/2, (h-sh)/2)
		xdraw.ApproxBiLinear.Scale(dst, image.Rectangle{Min: off, Max: off.Add(image.Pt(sw, sh))}, bg, b, draw.Src, nil)
	} else {
		// Sem fundo: degradê azul-escuro.
		for y := 0; y < h; y++ {
			t := float64(y) / float64(h)
			c := color.RGBA{uint8(11 + 10*t), uint8(31 + 30*t), uint8(68 + 50*t), 255}
			draw.Draw(dst, image.Rect(0, y, w, y+1), image.NewUniform(c), image.Point{}, draw.Src)
		}
	}

	ui := float64(h) / 1080.0
	if ui < 0.75 {
		ui = 0.75
	}
	px := func(v float64) int { return int(v * ui) }
	bold := newFace(gobold.TTF, 17*ui)
	reg := newFace(goregular.TTF, 16*ui)
	small := newFace(goregular.TTF, 13*ui)

	type line struct{ label, value string }
	var lines []line
	add := func(l, v string) {
		if strings.TrimSpace(v) != "" {
			lines = append(lines, line{l, v})
		}
	}
	add("Computador", st.Hostname)
	add("Usuário", user)
	add("IP", strings.Join(st.IPs, "  "))
	add("Sistema", st.OS)
	add("Acesso remoto", st.RemoteID)
	add("Cliente", firstNonEmpty(st.Settings.Client, st.ClientName))
	add("Suporte", st.Settings.Phone)

	labelW := 0
	for _, l := range lines {
		if tw := textWidth(bold, l.label); tw > labelW {
			labelW = tw
		}
	}
	valueW := 0
	for _, l := range lines {
		if tw := textWidth(reg, l.value); tw > valueW {
			valueW = tw
		}
	}
	msg := firstNonEmpty(st.Settings.Message, "Suporte de TI")
	logo, _ := png.Decode(bytes.NewReader(logoPNG))
	pad := px(22)
	lineH := px(27)
	logoW := px(300)
	logoH := 0
	if logo != nil {
		logoH = logoW * logo.Bounds().Dy() / logo.Bounds().Dx()
	}
	contentW := max(labelW+px(14)+valueW, logoW, textWidth(small, msg))
	pw := contentW + 2*pad
	ph := pad + logoH + px(14) + len(lines)*lineH + px(8) + px(20) + pad
	margin := px(28)
	var r image.Rectangle
	switch st.Settings.Position {
	case "top-right":
		r = image.Rect(w-pw-margin, margin, w-margin, margin+ph)
	case "top-left":
		r = image.Rect(margin, margin, margin+pw, margin+ph)
	case "bottom-left":
		r = image.Rect(margin, h-ph-px(70), margin+pw, h-px(70))
	default: // bottom-right, acima da barra de tarefas
		r = image.Rect(w-pw-margin, h-ph-px(70), w-margin, h-px(70))
	}
	fillRounded(dst, r, px(14), panel)
	// Faixa de destaque na cor da marca.
	draw.Draw(dst, image.Rect(r.Min.X+px(14), r.Min.Y, r.Max.X-px(14), r.Min.Y+px(4)), image.NewUniform(cyan), image.Point{}, draw.Over)

	y := r.Min.Y + pad
	if logo != nil {
		xdraw.CatmullRom.Scale(dst, image.Rect(r.Min.X+pad, y, r.Min.X+pad+logoW, y+logoH), logo, logo.Bounds(), draw.Over, nil)
		y += logoH + px(14)
	}
	for _, l := range lines {
		y += lineH
		drawText(dst, bold, r.Min.X+pad, y-px(8), navy, l.label)
		drawText(dst, reg, r.Min.X+pad+labelW+px(14), y-px(8), gray, l.value)
	}
	y += px(8) + px(20)
	drawText(dst, small, r.Min.X+pad, y-px(4), cyan, msg)
	return dst
}
