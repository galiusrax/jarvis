/* Jarvis brain pack: extra offline skills layered on top of offline.js (no network, no model).
 * Timers, dice/coin, random numbers, dashboard headlines/weather, and a small bilingual knowledge base. */
(function () {
  "use strict";
  const O = window.JarvisOffline; if (!O) return;
  const base = O.respond, strip = (s) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const KB = [ // [min keywords to match, keywords (en+es), english, spanish]
    [1, "photosynth fotosint", "Plants turn sunlight, water and carbon dioxide into sugar and oxygen using chlorophyll.", "Las plantas convierten luz solar, agua y dióxido de carbono en azúcar y oxígeno usando clorofila."],
    [1, "gravity gravedad", "Gravity is the attraction between masses; on Earth it accelerates objects at about 9.8 m/s².", "La gravedad es la atracción entre masas; en la Tierra acelera los objetos a unos 9,8 m/s²."],
    [2, "speed light velocidad luz", "Light travels at about 299,792 km per second.", "La luz viaja a unos 299.792 km por segundo."],
    [1, "pythagor pitagor", "In a right triangle, a² + b² = c², where c is the hypotenuse.", "En un triángulo rectángulo, a² + b² = c², donde c es la hipotenusa."],
    [1, "dna adn", "DNA is the molecule carrying genetic instructions, shaped as a double helix.", "El ADN es la molécula que porta las instrucciones genéticas, con forma de doble hélice."],
    [2, "bones huesos body cuerpo", "An adult human has 206 bones.", "Un adulto humano tiene 206 huesos."],
    [2, "planets planetas solar", "The Solar System has eight planets: Mercury, Venus, Earth, Mars, Jupiter, Saturn, Uranus and Neptune.", "El Sistema Solar tiene ocho planetas: Mercurio, Venus, Tierra, Marte, Júpiter, Saturno, Urano y Neptuno."],
    [1, "pi", "Pi is about 3.14159, the ratio of a circle's circumference to its diameter.", "Pi vale unos 3,14159, la razón entre la circunferencia y el diámetro."],
    [2, "artificial intelligence inteligencia", "Artificial intelligence is software that performs tasks needing human-like judgement, such as language or pattern recognition.", "La inteligencia artificial es software que realiza tareas que requieren juicio humano, como lenguaje o reconocimiento de patrones."],
    [1, "internet", "The internet is a global network of computers exchanging data through shared protocols.", "Internet es una red global de computadores que intercambian datos mediante protocolos comunes."],
    [2, "capital chile", "The capital of Chile is Santiago.", "La capital de Chile es Santiago."],
    [2, "independence independencia chile", "Chile celebrates its independence on 18 September (first national government, 1810).", "Chile celebra su independencia el 18 de septiembre (primera junta de gobierno, 1810)."],
    [2, "driest desert atacama", "The Atacama Desert in northern Chile is the driest non-polar desert on Earth.", "El desierto de Atacama, en el norte de Chile, es el desierto no polar más seco de la Tierra."],
    [2, "boil hierv ebull water agua", "Water boils at 100 °C (212 °F) at sea level.", "El agua hierve a 100 °C (212 °F) a nivel del mar."],
    [2, "freez conge water agua", "Water freezes at 0 °C (32 °F).", "El agua se congela a 0 °C (32 °F)."],
    [2, "earth sun distance distancia tierra sol", "The Earth is about 150 million km from the Sun.", "La Tierra está a unos 150 millones de km del Sol."],
  ].map((e) => [e[0], e[1].split(" "), e[2], e[3]]);
  const hit = (t, k) => t === k || (k.length >= 4 && t.startsWith(k));

  function kb(n, es) {
    if (!(/\?\s*$/.test(n) || /^(what|who|how|why|which|where|when|tell|explain|define|que|quien|como|cual|cuanto|donde|cuando|por que|explica|dime|cuentame)\b/.test(n))) return null;
    const toks = n.split(/[^a-z0-9]+/).filter(Boolean); let best = null, top = 0;
    for (const e of KB) { const s = e[1].filter((k) => toks.some((t) => hit(t, k))).length; if (s >= e[0] && s > top) { top = s; best = e; } }
    return best ? (es ? best[3] : best[2]) : null;
  }

  O.respond = async function (raw, tools, opts) {
    const n = strip(raw), A = (opts && opts.address) || "sir";
    const es = /[¿¡ñáéíóú]/i.test(raw) || /\b(que|como|cual|quien|cuanto|hola|dime|noticias|clima|dado|moneda|pon|temporizador|segundos|minutos|horas)\b/.test(n);
    const D = window.JarvisDash;
    let m;
    if (/\b(flip|toss|lanza|tira|echa)\b.*\b(coin|moneda)\b/.test(n)) return (Math.random() < .5 ? (es ? "Cara" : "Heads") : (es ? "Sello" : "Tails")) + ", " + A + ".";
    if ((m = n.match(/\b(?:roll|tira|lanza)\b.*?\b(?:a |an |un )?(?:d(\d+)|dado|dice|die)/))) { const s = +m[1] || 6; return (es ? "Salió un " : "You rolled a ") + (1 + Math.floor(Math.random() * s)) + " (d" + s + ")."; }
    if ((m = n.match(/\b(?:random number|numero aleatorio|numero al azar)\b.*?(\d+)\D+(\d+)/))) { const a = Math.min(+m[1], +m[2]), b = Math.max(+m[1], +m[2]); return String(a + Math.floor(Math.random() * (b - a + 1))); }
    if ((m = n.match(/\b(?:timer|temporizador|alarma|cuenta regresiva|avisame|remind me)\b.*?(\d+)\s*(seconds?|secs?|segundos?|seg|minutes?|mins?|minutos?|hours?|horas?|h)\b/))) {
      const u = m[2][0], ms = +m[1] * (u === "s" ? 1e3 : u === "h" ? 36e5 : 6e4);
      if (ms > 0 && ms <= 864e5) { setTimeout(() => window.dispatchEvent(new CustomEvent("jarvis-say", { detail: es ? `${A}, su temporizador de ${m[1]} ${m[2]} ha terminado.` : `${A}, your ${m[1]} ${m[2]} timer is up.` })), ms); return es ? `Muy bien, ${A}. Le avisaré en ${m[1]} ${m[2]} (mientras esta página siga abierta).` : `Very good, ${A}. I shall alert you in ${m[1]} ${m[2]} (while this page stays open).`; }
    }
    if (/\b(news|noticias|titulares|headlines)\b/.test(n) && D) { const h = D.headlines(5); return h.length ? (es ? "Titulares de hoy:\n- " : "Today's headlines:\n- ") + h.join("\n- ") : (es ? "Aún no tengo titulares; necesito conexión una vez." : "No headlines yet; I need a connection once."); }
    const wk = /\b(weather|clima|temperatura|pronostico|forecast)\b/.test(n), ck = /\b(clothes|clothing|clothe|cloths?|wear|outfit|jacket|coat|umbrella|ropa|vestir|vestirme|abrigo|pongo|chaqueta|paraguas)\b/.test(n);
    const city = /\b(?:in|en|for|para|at|de)\s+(?!today|tomorrow|now|hoy|manana|ahora|tonight|this|my|the|la|el|mi|me\b)[a-z]{3}/.test(n);
    if ((wk || ck) && !city && D) { const w = D.weatherText(es), o = ck ? D.outfit(es) : null; if (w || o) return [wk || !o ? w : null, o].filter(Boolean).join("\n"); }
    const k = kb(n, es); if (k) return k;
    return base(raw, tools, opts);
  };
})();
