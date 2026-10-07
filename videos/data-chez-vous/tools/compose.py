"""Génère index.html du film « Vos données restent chez vous » (HyperFrames, 1920x1080, 44 s).

Le gabarit ci-dessous est le film ; ce script y insère les icônes (Phosphor, inline) puis écrit index.html.
Lancer :  python tools/compose.py
"""
import random
import re
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SITE = ROOT.parent.parent / "website-v2"
ICONS = SITE / "node_modules/@phosphor-icons/core/assets/bold"
FONTS = SITE / "node_modules/@fontsource-variable"

# --- ressources locales (rien n'est chargé depuis le réseau, sauf GSAP via le gabarit HyperFrames) ---
(ROOT / "assets/fonts").mkdir(parents=True, exist_ok=True)
shutil.copy(FONTS / "space-grotesk/files/space-grotesk-latin-wght-normal.woff2", ROOT / "assets/fonts/space-grotesk.woff2")
shutil.copy(FONTS / "inter/files/inter-latin-wght-normal.woff2", ROOT / "assets/fonts/inter.woff2")
shutil.copy(SITE / "public/brand/mark-on-dark.svg", ROOT / "assets/mark.svg")


def icon(name):
    svg = (ICONS / f"{name}-bold.svg").read_text(encoding="utf-8")
    return svg.replace("<svg ", '<svg class="pi" aria-hidden="true" ', 1)


# --- particules de l'ouverture : positions fixes (graine) ---
rnd = random.Random(11)
particles = "".join(
    f'<i class="pt" style="left:{rnd.randint(40, 1840)}px;top:{rnd.randint(120, 980)}px;width:{(s := rnd.choice([26, 34, 44, 58]))}px;height:{int(s * 1.15)}px"></i>'
    for _ in range(16)
)

TEMPLATE = r"""<!doctype html>
<html lang="fr" data-resolution="landscape">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=1920, height=1080" />
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
    <style>
      @font-face { font-family: "Space Grotesk"; src: url("assets/fonts/space-grotesk.woff2") format("woff2"); font-weight: 300 700; font-style: normal; }
      @font-face { font-family: "Inter"; src: url("assets/fonts/inter.woff2") format("woff2"); font-weight: 100 900; font-style: normal; }
      * { margin: 0; padding: 0; box-sizing: border-box; }
      :root {
        --bg: #1d1c21; --panel: #2f2e34; --orange: #ef7c2f; --orange-text: #f29a5a; --deep: #a94a0a;
        --cream: #ece7df; --muted: #b6aea3; --line: rgba(255, 255, 255, 0.16);
        --hex: polygon(50% 0, 100% 25%, 100% 75%, 50% 100%, 0 75%, 0 25%);
      }
      html, body { width: 1920px; height: 1080px; overflow: hidden; background: var(--bg); }
      #root { position: relative; width: 100%; height: 100%; overflow: hidden; font-family: "Inter", sans-serif; color: var(--cream); }
      .abs { position: absolute; }
      .scene { position: absolute; inset: 0; }
      .pi { width: 100%; height: 100%; fill: currentColor; display: block; }
      h1, h2, h3, .disp { font-family: "Space Grotesk", sans-serif; font-weight: 600; letter-spacing: -0.02em; line-height: 1.1; }

      /* fond */
      #bg { position: absolute; inset: 0; background: var(--bg); overflow: hidden; }
      #glow { position: absolute; left: -300px; top: -400px; width: 1500px; height: 1300px; background: radial-gradient(circle, rgba(239, 124, 47, 0.22), transparent 62%); }
      #pattern { position: absolute; left: -260px; top: -180px; width: 2500px; height: 1500px; opacity: 0.9;
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='112' height='194' viewBox='0 0 56 97'%3E%3Cpath d='M28 0l28 16v32L28 64 0 48V16zM28 64l28 16v17M28 64L0 80v17' fill='none' stroke='%23ffffff' stroke-opacity='0.06' stroke-width='1'/%3E%3C/svg%3E"); }

      /* scène 1 : ouverture */
      #markWrap { left: 760px; top: 190px; width: 400px; height: 400px; }
      #markWrap img { width: 100%; height: 100%; display: block; }
      #title1 { left: 0; top: 640px; width: 1920px; text-align: center; font-size: 104px; display: flex; justify-content: center; gap: 28px; flex-wrap: nowrap; white-space: nowrap; }
      #title1 span { display: inline-block; }
      #title1 .acc { color: var(--orange-text); }
      .pt { position: absolute; border: 2px solid rgba(239, 124, 47, 0.5); clip-path: var(--hex); background: rgba(239, 124, 47, 0.08); }

      /* scène 2 : le périmètre */
      .headL { left: 120px; top: 330px; width: 760px; }
      .headL h2 { font-size: 72px; }
      .headL p { margin-top: 26px; font-size: 36px; line-height: 1.35; color: var(--muted); }
      .headL em { font-style: normal; color: var(--orange-text); }
      #diagStage { left: 880px; top: 90px; width: 1000px; height: 900px; perspective: 2200px; }
      #tilt { position: absolute; inset: 0; transform-style: preserve-3d; }
      #perim { left: 30px; top: 150px; width: 560px; height: 646px; }
      #perim svg { width: 100%; height: 100%; overflow: visible; }
      #perimTag { left: 170px; top: 126px; padding: 6px 22px; border-radius: 999px; background: var(--orange); color: #1f1b16; font-weight: 700; font-size: 28px; }
      .doc { width: 104px; height: 104px; border-radius: 18px; background: var(--panel); border: 2px solid var(--line); color: var(--cream); padding: 22px; box-shadow: 0 14px 30px rgba(0, 0, 0, 0.35); }
      .doc.go { color: var(--orange-text); border-color: rgba(239, 124, 47, 0.6); }
      #cloudWrap { left: 720px; top: 150px; width: 230px; height: 230px; }
      #cloud, #cloudSlash { position: absolute; inset: 0; border-radius: 28px; background: var(--panel); border: 2px solid var(--line); color: var(--cream); padding: 42px; }
      #cloudSlash { color: var(--orange-text); border-color: rgba(239, 124, 47, 0.7); }
      #cloudLabel { left: 696px; top: 396px; width: 280px; text-align: center; font-size: 30px; color: var(--muted); font-weight: 600; }
      #link { left: 560px; top: 224px; width: 190px; height: 80px; }
      #link svg { width: 100%; height: 100%; overflow: visible; }
      #bot { left: 660px; top: 380px; width: 168px; height: 194px; }
      #bot .hexo { position: absolute; inset: 0; clip-path: var(--hex); background: var(--orange); }
      #bot .hexi { position: absolute; inset: 8px; clip-path: var(--hex); background: var(--deep); color: #fff; padding: 38px 34px; }
      #lock { left: 470px; top: 110px; width: 118px; height: 118px; border-radius: 50%; background: var(--orange); color: #1f1b16; padding: 26px; box-shadow: 0 0 0 10px rgba(239, 124, 47, 0.22); }
      #notes { left: 30px; top: 818px; width: 960px; display: flex; gap: 18px; }
      .note { padding: 10px 22px; border-radius: 999px; border: 2px solid var(--line); font-size: 28px; color: var(--cream); background: rgba(255, 255, 255, 0.05); white-space: nowrap; }

      /* scène 3 : le nid d'abeille 3D */
      #hiveStage { left: 60px; top: 110px; width: 940px; height: 860px; perspective: 1500px; }
      #hiveMove { position: absolute; inset: 0; display: grid; place-items: center; transform-style: preserve-3d; }
      #plane { position: relative; width: 0; height: 0; transform-style: preserve-3d; transform: rotateX(58deg) rotateZ(-28deg); }
      .cell { position: absolute; width: 168px; height: 194px; left: calc(var(--q) * 168px * 1.1 - 84px); top: calc(var(--r) * 194px * 0.83 - 97px); transform-style: preserve-3d; }
      .cell .l { position: absolute; inset: 0; clip-path: var(--hex); background: #3a383f; }
      .cell .l2 { transform: translateZ(6px); } .cell .l3 { transform: translateZ(12px); } .cell .top { transform: translateZ(18px); background: #2f2e34; }
      .cell.core .l { background: #14131a; } .cell.core .top { background: #242329; }
      .icw { position: absolute; left: 50%; top: 50%; width: 96px; height: 96px; margin: -48px 0 0 -48px; transform: translateZ(20px); }
      .icw .in { width: 100%; height: 100%; display: grid; place-items: center; color: #77727d; padding: 8px; }
      .icw.mono .in { color: var(--cream); padding: 0; }
      .icw.mono img { width: 74px; height: 74px; }
      #texts { left: 1090px; top: 250px; width: 760px; height: 560px; }
      .say { position: absolute; left: 0; top: 0; width: 760px; }
      .say .chipI { width: 112px; height: 112px; border-radius: 26px; background: var(--orange); color: #1f1b16; padding: 26px; }
      .say h3 { margin-top: 36px; font-size: 76px; }
      .say p { margin-top: 22px; font-size: 38px; line-height: 1.35; color: var(--muted); }
      #dots { left: 1090px; top: 860px; display: flex; gap: 14px; }
      .dot { width: 54px; height: 8px; border-radius: 4px; background: rgba(255, 255, 255, 0.18); }

      /* scène 4 : fermeture */
      #endMark { left: 760px; top: 130px; width: 400px; height: 400px; }
      #endMark img { width: 100%; height: 100%; display: block; }
      .ring { left: 810px; top: 168px; width: 300px; height: 346px; clip-path: var(--hex); border: 0; background: rgba(239, 124, 47, 0.16); }
      #brand { left: 0; top: 570px; width: 1920px; text-align: center; font-size: 132px; }
      #tag { left: 0; top: 740px; width: 1920px; text-align: center; font-size: 46px; color: var(--muted); }
      #url { left: 700px; top: 850px; width: 520px; height: 96px; border-radius: 999px; border: 3px solid var(--orange); color: var(--orange-text); font-family: "Space Grotesk", sans-serif; font-weight: 600; font-size: 46px; display: grid; place-items: center; }
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="44" data-width="1920" data-height="1080">

      <div id="bg" class="clip" data-start="0" data-duration="44" data-track-index="0">
        <div id="glow"></div>
        <div id="pattern"></div>
      </div>

      <!-- 1. ouverture -->
      <section id="s1" class="scene clip" data-start="0" data-duration="4.6" data-track-index="1">
        [[PARTICLES]]
        <div id="markWrap" class="abs"><img src="assets/mark.svg" alt="" /></div>
        <h1 id="title1" class="abs"><span class="w">Vos</span><span class="w">données</span><span class="w">restent</span><span class="w acc">chez vous.</span></h1>
      </section>

      <!-- 2. le périmètre : problème puis solution -->
      <section id="s2" class="scene clip" data-start="4" data-duration="18.6" data-track-index="2">
        <div id="h2a" class="headL abs"><h2>Beaucoup d'outils d'IA envoient vos documents <em>chez un tiers.</em></h2></div>
        <div id="h2b" class="headL abs"><h2>Avec Seshat, l'IA <em>vient chez vous.</em></h2><p id="h2bp">Déployée sur votre infrastructure, avec les modèles que vous choisissez.</p></div>
        <div id="diagStage" class="abs"><div id="tilt">
          <div id="perim" class="abs">
            <svg viewBox="0 0 560 646" fill="none">
              <polygon id="perimDash" points="280,8 546,162 546,484 280,638 14,484 14,162" stroke="#ef7c2f" stroke-width="5" stroke-dasharray="16 14" stroke-linejoin="round"/>
              <polygon id="perimSolid" points="280,8 546,162 546,484 280,638 14,484 14,162" stroke="#ef7c2f" stroke-width="8" stroke-linejoin="round" pathLength="1" stroke-dasharray="1" stroke-dashoffset="1"/>
            </svg>
          </div>
          <div id="perimTag" class="abs">Votre entreprise</div>
          <div id="d1" class="doc abs" style="left:170px;top:330px">[[file-text]]</div>
          <div id="d2" class="doc abs" style="left:318px;top:430px">[[file-text]]</div>
          <div id="d3" class="doc abs" style="left:200px;top:560px">[[file-text]]</div>
          <div id="e1" class="doc abs" style="left:170px;top:330px">[[file-text]]</div>
          <div id="e2" class="doc abs" style="left:318px;top:430px">[[file-text]]</div>
          <div id="e3" class="doc abs" style="left:200px;top:560px">[[file-text]]</div>
          <div id="link" class="abs"><svg viewBox="0 0 190 80" fill="none"><path id="linkPath" d="M0 70 C70 70 110 10 190 10" stroke="#b6aea3" stroke-width="5" stroke-dasharray="10 12" stroke-linecap="round"/></svg></div>
          <div id="cloudWrap" class="abs"><div id="cloud">[[cloud]]</div><div id="cloudSlash">[[cloud-slash]]</div></div>
          <div id="cloudLabel" class="abs disp">Services tiers</div>
          <div id="bot" class="abs"><div class="hexo"></div><div class="hexi">[[robot]]</div></div>
          <div id="lock" class="abs">[[lock-key]]</div>
          <div id="notes" class="abs"><span id="n1" class="note">Vos données</span><span id="n2" class="note">Votre infrastructure</span><span id="n3" class="note">Vous gardez le contrôle</span></div>
        </div></div>
      </section>

      <!-- 3. les quatre engagements -->
      <section id="s3" class="scene clip" data-start="22" data-duration="13.4" data-track-index="3">
        <div id="hiveStage" class="abs"><div id="hiveMove"><div id="plane">
          <div class="cell core" style="--q:0;--r:0"><i class="l l1"></i><i class="l l2"></i><i class="l l3"></i><i class="l top"></i><span class="icw mono"><span class="in"><img src="assets/mark.svg" alt="" /></span></span></div>
          <div id="c0" class="cell" style="--q:1;--r:0"><i class="l l1"></i><i class="l l2"></i><i class="l l3"></i><i class="l top"></i><span class="icw"><span class="in">[[database]]</span></span></div>
          <div id="c1" class="cell" style="--q:0.5;--r:1"><i class="l l1"></i><i class="l l2"></i><i class="l l3"></i><i class="l top"></i><span class="icw"><span class="in">[[code]]</span></span></div>
          <div id="c2" class="cell" style="--q:-0.5;--r:1"><i class="l l1"></i><i class="l l2"></i><i class="l l3"></i><i class="l top"></i><span class="icw"><span class="in">[[user-check]]</span></span></div>
          <div id="c3" class="cell" style="--q:-1;--r:0"><i class="l l1"></i><i class="l l2"></i><i class="l l3"></i><i class="l top"></i><span class="icw"><span class="in">[[plugs-connected]]</span></span></div>
          <div id="c4" class="cell" style="--q:-0.5;--r:-1"><i class="l l1"></i><i class="l l2"></i><i class="l l3"></i><i class="l top"></i></div>
          <div id="c5" class="cell" style="--q:0.5;--r:-1"><i class="l l1"></i><i class="l l2"></i><i class="l l3"></i><i class="l top"></i></div>
        </div></div></div>
        <div id="texts" class="abs">
          <div id="t0" class="say"><div class="chipI">[[database]]</div><h3>Vos données restent chez vous.</h3><p>Des solutions auto-hébergées, sur une infrastructure que vous contrôlez.</p></div>
          <div id="t1" class="say"><div class="chipI">[[code]]</div><h3>Vous pouvez inspecter le code.</h3><p>Le runtime Seshat est open source. SeshatOS est public en source-available.</p></div>
          <div id="t2" class="say"><div class="chipI">[[user-check]]</div><h3>Un humain valide l'important.</h3><p>Une personne relit et valide les décisions sensibles.</p></div>
          <div id="t3" class="say"><div class="chipI">[[plugs-connected]]</div><h3>Le bon outil, pas forcément le nôtre.</h3><p>Si une solution du marché convient mieux, le diagnostic vous le dit.</p></div>
        </div>
        <div id="dots" class="abs"><i class="dot" id="g0"></i><i class="dot" id="g1"></i><i class="dot" id="g2"></i><i class="dot" id="g3"></i></div>
      </section>

      <!-- 4. fermeture -->
      <section id="s4" class="scene clip" data-start="35" data-duration="9" data-track-index="4">
        <div id="r1" class="ring abs"></div><div id="r2" class="ring abs"></div>
        <div id="endMark" class="abs"><img src="assets/mark.svg" alt="" /></div>
        <div id="brand" class="abs disp">Seshat AI</div>
        <div id="tag" class="abs">Conseil et intégration d'IA souveraine pour PME et ETI.</div>
        <div id="url" class="abs">seshat-ai.com</div>
      </section>

      <audio id="music" src="assets/music-film.mp3" data-start="0" data-duration="44" data-track-index="5" data-volume="1"></audio>
    </div>

    <script>
      const tl = gsap.timeline({ paused: true });
      const ease = { out: "power3.out", io: "power2.inOut", back: "back.out(1.6)" };
      const ORANGE = "#ef7c2f", DEEP = "#a94a0a";
      /* Grille du morceau : 120 battements par minute, un temps = 0,5 s, une mesure = 2 s.
         Intro douce jusqu'à 12 s, puis l'orchestre entre : c'est le moment « l'IA vient chez vous ». */

      /* fond : motif qui dérive, lueur qui change de place selon la scène */
      tl.fromTo("#pattern", { x: 0, y: 0 }, { x: -170, y: -100, duration: 44, ease: "none" }, 0);
      tl.fromTo("#glow", { x: 0, y: 0, opacity: 0.9 }, { x: 260, y: 160, opacity: 0.55, duration: 12, ease: "sine.inOut" }, 0);
      tl.to("#glow", { x: 700, y: 420, opacity: 0.85, duration: 30, ease: "sine.inOut" }, 12);

      /* ---------- scène 1 : ouverture (0 - 4,6 s) ---------- */
      tl.fromTo("#markWrap", { scale: 0.5, opacity: 0, rotation: -14 }, { scale: 1, opacity: 1, rotation: 0, duration: 1.0, ease: "back.out(1.5)" }, 0.1);
      tl.fromTo("#title1 .w", { y: 46, opacity: 0 }, { y: 0, opacity: 1, duration: 0.6, stagger: 0.5, ease: ease.out }, 0.6);
      tl.fromTo("#s1 .pt", { y: 40, opacity: 0, scale: 0.6 }, { y: -90, opacity: 1, scale: 1, duration: 3.8, stagger: 0.04, ease: "sine.out" }, 0.2);
      tl.to("#markWrap", { y: -10, duration: 1.5, ease: "sine.inOut", yoyo: true, repeat: 1 }, 1.0);
      tl.to("#s1 .pt", { opacity: 0, duration: 0.4 }, 3.8);
      tl.to(["#markWrap", "#title1"], { opacity: 0, scale: 1.08, duration: 0.5, ease: "power2.in" }, 3.9);

      /* ---------- scène 2 : périmètre (4 - 22,6 s) ---------- */
      gsap.set("#tilt", { rotationX: 4, transformPerspective: 2200 });
      gsap.set(["#h2b", "#cloudSlash", "#bot", "#lock", "#e1", "#e2", "#e3", "#perimSolid", "#n1", "#n2", "#n3"], { opacity: 0 });
      tl.fromTo("#h2a", { y: 36, opacity: 0 }, { y: 0, opacity: 1, duration: 0.7, ease: ease.out }, 4.5);
      tl.fromTo("#tilt", { rotationY: -30, opacity: 0, x: 140 }, { rotationY: -11, opacity: 1, x: 0, duration: 1.2, ease: ease.out }, 4.4);
      tl.fromTo(["#perimTag", "#cloudWrap", "#cloudLabel"], { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.6, stagger: 0.25, ease: ease.out }, 5.0);
      tl.fromTo(["#d1", "#d2", "#d3"], { scale: 0.3, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.5, stagger: 0.25, ease: ease.back }, 5.5);
      tl.fromTo("#linkPath", { strokeDashoffset: 0 }, { strokeDashoffset: -88, duration: 6, ease: "none" }, 6.0);
      /* les documents quittent le périmètre vers le nuage, un temps fort sur trois */
      [["#d1", 6.5, 550, -100], ["#d2", 8.0, 548, -185], ["#d3", 9.5, 540, -320]].forEach(([id, at, dx, dy]) => {
        tl.to(id, { color: ORANGE, duration: 0.3 }, at);
        tl.to(id, { x: dx, y: dy, scale: 0.55, duration: 1.5, ease: ease.io }, at);
        tl.to(id, { opacity: 0, duration: 0.3 }, at + 1.25);
        tl.fromTo("#cloud", { scale: 1 }, { scale: 1.1, duration: 0.18, yoyo: true, repeat: 1, ease: "power1.out" }, at + 1.3);
      });
      /* la bascule : l'orchestre entre à 12 s */
      tl.to("#h2a", { y: -30, opacity: 0, duration: 0.4, ease: "power2.in" }, 11.5);
      tl.to("#link", { opacity: 0, duration: 0.4 }, 11.6);
      tl.fromTo("#h2b", { y: 36, opacity: 0 }, { y: 0, opacity: 1, duration: 0.6, ease: ease.out }, 12.0);
      tl.to("#cloud", { opacity: 0.35, duration: 0.4 }, 12.0);
      tl.fromTo("#cloudSlash", { opacity: 0, scale: 1.25 }, { opacity: 1, scale: 1, duration: 0.5, ease: ease.back }, 12.0);
      tl.fromTo("#h2bp", { y: 20, opacity: 0 }, { y: 0, opacity: 1, duration: 0.6, ease: ease.out }, 12.5);
      tl.fromTo(["#e1", "#e2", "#e3"], { scale: 0.3, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.5, stagger: 0.5, ease: ease.back }, 12.5);
      /* l'assistant vient chez vous */
      tl.fromTo("#bot", { x: 420, y: -120, scale: 0.6, opacity: 0, rotation: 18 }, { x: -230, y: 90, scale: 1, opacity: 1, rotation: 0, duration: 2.0, ease: "power3.out" }, 13.0);
      tl.to("#bot", { y: -14 + 90, duration: 1.0, yoyo: true, repeat: 5, ease: "sine.inOut" }, 15.0);
      /* le périmètre se ferme */
      tl.to("#perimDash", { opacity: 0, duration: 0.5 }, 15.0);
      tl.fromTo("#perimSolid", { opacity: 1, strokeDashoffset: 1 }, { opacity: 1, strokeDashoffset: 0, duration: 1.5, ease: "power2.inOut" }, 15.0);
      tl.fromTo("#lock", { scale: 0, opacity: 0, rotation: -40 }, { scale: 1, opacity: 1, rotation: 0, duration: 0.6, ease: "back.out(2.2)" }, 16.5);
      tl.fromTo(["#n1", "#n2", "#n3"], { y: 24, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, stagger: 0.5, ease: ease.out }, 17.5);
      tl.to(["#h2b", "#tilt"], { opacity: 0, duration: 0.6, ease: "power2.in" }, 21.4);

      /* ---------- scène 3 : nid d'abeille 3D (22 - 35,4 s) ---------- */
      const cells = ["#c0", "#c1", "#c2", "#c3"];
      gsap.set(["#t0", "#t1", "#t2", "#t3"], { opacity: 0 });
      tl.fromTo("#hiveMove", { scale: 0.8, opacity: 0, x: -60 }, { scale: 1.3, opacity: 1, x: 0, duration: 1.2, ease: ease.out }, 22.0);
      tl.fromTo("#s3 .cell", { z: -140 }, { z: 0, duration: 1.0, stagger: 0.07, ease: ease.out }, 22.1);
      tl.to("#hiveMove", { scale: 1.42, x: 20, duration: 12, ease: "sine.inOut" }, 23.0);
      cells.forEach((id, i) => {
        const at = 23.0 + i * 3.0;
        tl.to(id, { z: 52, duration: 0.6, ease: ease.back }, at);
        tl.to(id + " .top", { backgroundColor: ORANGE, duration: 0.4 }, at);
        tl.to(id + " .in", { color: "#1f1b16", duration: 0.4 }, at);
        tl.to(id + " .l1, " + id + " .l2, " + id + " .l3", { backgroundColor: DEEP, duration: 0.4 }, at);
        if (i < 3) tl.to(id, { z: 22, duration: 0.5, ease: "power2.inOut" }, at + 2.5);
        tl.fromTo("#t" + i, { x: 60, opacity: 0 }, { x: 0, opacity: 1, duration: 0.6, ease: ease.out }, at + 0.1);
        if (i < 3) tl.to("#t" + i, { x: -40, opacity: 0, duration: 0.4, ease: "power2.in" }, at + 2.5);
        tl.to("#g" + i, { backgroundColor: ORANGE, duration: 0.4 }, at + 0.1);
      });
      tl.to(["#t3", "#hiveMove", "#dots"], { opacity: 0, duration: 0.5, ease: "power2.in" }, 34.5);

      /* ---------- scène 4 : fermeture (35 - 44 s) ---------- */
      tl.fromTo("#endMark", { scale: 0.6, opacity: 0, rotation: -12 }, { scale: 1, opacity: 1, rotation: 0, duration: 1.0, ease: "back.out(1.5)" }, 35.2);
      tl.fromTo(["#r1", "#r2"], { scale: 0.7, opacity: 0.9 }, { scale: 2.6, opacity: 0, duration: 2.4, stagger: 0.5, ease: "power2.out" }, 35.4);
      tl.fromTo("#brand", { y: 36, opacity: 0 }, { y: 0, opacity: 1, duration: 0.7, ease: ease.out }, 36.0);
      tl.fromTo("#tag", { y: 26, opacity: 0 }, { y: 0, opacity: 1, duration: 0.7, ease: ease.out }, 36.5);
      tl.fromTo("#url", { scale: 0.85, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.6, ease: ease.back }, 37.5);
      tl.to("#endMark", { y: -12, duration: 2.0, yoyo: true, repeat: 3, ease: "sine.inOut" }, 38.0);

      window.__timelines["main"] = tl;
      tl.seek(0);
    </script>
  </body>
</html>
"""

html = TEMPLATE.replace("[[PARTICLES]]", particles)
html = re.sub(r"\[\[([a-z\-]+)\]\]", lambda m: icon(m.group(1)), html)
(ROOT / "index.html").write_text(html, encoding="utf-8")
print("index.html écrit :", len(html) // 1024, "Ko")
