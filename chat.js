/* Jarvis conversation brain: no model, no download, instant on every device.
 * Small talk, moods, entertainment, everyday suggestions, light utilities, and a tiny dialogue manager
 * (it remembers what it just asked, so "yes", "good" or "Frank" are understood). English + Spanish, butler manner. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(); else root.JarvisChat = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  const st = { expect: null, riddle: null, tries: 0, askedName: false, last: "" };
  const fill = (e, t) => String(t).replace(/\{A\}/g, e.A).replace(/\{name\}/g, e.name || e.A);
  function pick(a) { let t = a[Math.floor(Math.random() * a.length)]; for (let i = 0; i < 4 && t === st.last && a.length > 1; i++) t = a[Math.floor(Math.random() * a.length)]; st.last = t; return t; }
  const R = (e, en, es) => fill(e, pick(e.es ? es : en));
  const titled = (v) => v.replace(/\b\p{L}/gu, (c) => c.toUpperCase());
  const hour = () => new Date().getHours();

  const JOKES = { en: ["Why do programmers prefer dark mode? Because light attracts bugs.", "Why did the scarecrow win an award? He was outstanding in his field.", "There are 10 kinds of people: those who understand binary and those who do not.", "I would tell you a joke about time travel, but you did not like it yesterday."],
    es: ["¿Por qué los programadores prefieren el modo oscuro? Porque la luz atrae bugs.", "¿Cuál es el colmo de un electricista? Que su mujer se llame Luz y no lo ilumine.", "Hay 10 tipos de personas: las que entienden binario y las que no.", "¿Qué le dice un jardinero a otro? Nos vemos en la poda."] };
  const FACTS = { en: ["Honey stored in sealed jars can remain edible for thousands of years.", "Octopuses have three hearts.", "A day on Venus is longer than a year on Venus.", "Botanically speaking, bananas are berries, while strawberries are not.", "Wombats produce cube-shaped droppings.", "Sound travels roughly four times faster in water than in air.", "Scotland's national animal is the unicorn.", "The human brain uses roughly a fifth of the body's energy."],
    es: ["La miel guardada en frascos sellados puede seguir siendo comestible durante miles de años.", "Los pulpos tienen tres corazones.", "Un día en Venus dura más que un año en Venus.", "Botánicamente, los plátanos son bayas y las fresas no.", "Los wombats producen excrementos con forma de cubo.", "El sonido viaja unas cuatro veces más rápido en el agua que en el aire.", "El animal nacional de Escocia es el unicornio.", "El cerebro humano usa aproximadamente una quinta parte de la energía del cuerpo."] };
  const STORIES = { en: ["Once, a butler found a clock that ran backwards. Rather than complain, he simply arrived early for everything, and was thereafter known as the most punctual man in the county.", "A small cloud grew weary of rain and asked the wind for a holiday. The wind obliged, and for one afternoon the whole town enjoyed the sun, until it began to miss the sound of the rain on its roofs.", "A lighthouse keeper once wrote a letter to the sea each evening. One night the sea replied with a bottle and a single line: 'Do keep the light on.' He never missed an evening again."],
    es: ["Una vez, un mayordomo encontró un reloj que andaba al revés. En lugar de quejarse, empezó a llegar temprano a todo, y desde entonces se le conoció como el hombre más puntual del condado.", "Una pequeña nube se cansó de llover y le pidió vacaciones al viento. El viento accedió y, por una tarde, todo el pueblo disfrutó del sol, hasta que empezó a extrañar el sonido de la lluvia en sus techos.", "Un farero escribía cada noche una carta al mar. Una noche el mar respondió con una botella y una sola línea: «Mantén la luz encendida». Nunca volvió a faltar una noche."] };
  const RIDDLES = { en: [["What has keys but cannot open a single lock?", ["piano", "keyboard"]], ["The more of me you take, the more you leave behind. What am I?", ["footsteps", "steps", "footstep"]], ["What has to be broken before you can use it?", ["egg"]], ["I speak without a mouth and hear without ears. What am I?", ["echo"]]],
    es: [["Tengo agujas pero no coso, y números pero no sé contar. ¿Qué soy?", ["reloj"]], ["Blanca por dentro, verde por fuera. Si quieres que te lo diga, espera.", ["pera"]], ["Cuanto más seca, más moja. ¿Qué es?", ["toalla"]], ["Tiene dientes pero no muerde. ¿Qué es?", ["peine"]]] };
  const RECS = { movie: { en: ["The Remains of the Day", "Paddington 2", "Knives Out", "The Grand Budapest Hotel", "Casablanca", "The King's Speech"], es: ["Cinema Paradiso", "El secreto de sus ojos", "Coco", "Amélie", "Casablanca", "La vida es bella"] },
    book: { en: ["The Remains of the Day by Kazuo Ishiguro", "Pride and Prejudice by Jane Austen", "The Adventures of Sherlock Holmes by Arthur Conan Doyle", "Right Ho, Jeeves by P. G. Wodehouse"], es: ["Don Quijote de la Mancha", "Cien años de soledad", "La sombra del viento", "Pedro Páramo"] },
    song: { en: ["Clair de Lune by Debussy", "Moon River by Henry Mancini", "Take Five by Dave Brubeck", "Here Comes the Sun by The Beatles"], es: ["Gracias a la vida de Violeta Parra", "Claro de luna de Debussy", "La Llorona de Chavela Vargas", "Como la cigarra de Mercedes Sosa"] } };
  const FOOD = { b: { en: ["Might I suggest eggs on toast with a pot of tea, {A}?", "Porridge with honey and sliced banana would be rather civilised, {A}.", "Yoghurt with fruit and a little granola is quick and light, {A}."], es: ["¿Le sugiero huevos con tostadas y una tetera, {A}?", "Avena con miel y plátano sería muy civilizado, {A}.", "Yogur con fruta y un poco de granola es rápido y ligero, {A}."] },
    l: { en: ["A chicken and avocado sandwich with a green salad, perhaps, {A}?", "Pasta with tomato and basil is hard to fault, {A}.", "A hearty lentil soup with crusty bread would suit nicely, {A}."], es: ["Quizá un sándwich de pollo y palta con ensalada, {A}.", "Pasta con tomate y albahaca es difícil de superar, {A}.", "Un buen guiso de lentejas con pan sería ideal, {A}."] },
    d: { en: ["Roast vegetables with rice and a fried egg are simple and satisfying, {A}.", "A tidy omelette with salad makes a respectable supper, {A}.", "Grilled fish or chicken with potatoes would do nicely, {A}."], es: ["Verduras asadas con arroz y un huevo frito son sencillas y reconfortantes, {A}.", "Una tortilla con ensalada es una cena muy respetable, {A}.", "Pescado o pollo a la plancha con papas quedaría muy bien, {A}."] } };
  const FAV = { color: ["navy, naturally", "azul marino, naturalmente"], colour: ["navy, naturally", "azul marino, naturalmente"], food: ["a well-made cup of tea", "una taza de té bien preparada"], music: ["Debussy's Clair de Lune", "Claro de luna de Debussy"], movie: ["The Remains of the Day", "Lo que queda del día"], book: ["anything by P. G. Wodehouse", "cualquier cosa de P. G. Wodehouse"], color_es: ["", ""] };

  const POS = /\b(good|great|fine|well|nice|awesome|happy|amazing|excellent|not bad|bien|genial|excelente|feliz|tranquilo|muy bien|todo bien)\b/;
  const NEG = /\b(bad|terrible|awful|horrible|tired|stressed|sad|rough|mal|fatal|cansado|cansada|triste|estresado|estresada|pesado|horrible)\b/;
  const NEUTRAL = /\b(ok|okay|so so|meh|average|normal|regular|asi asi|mas o menos)\b/;

  // ---- what the user may answer after a question Jarvis asked
  function pre(raw, n, words, e) {
    const ex = st.expect; if (!ex) return null;
    const short = words.length <= 12 && !/\?\s*$/.test(raw);
    if (ex === "name") {
      st.expect = null;
      if (words.length > 4 || /\?/.test(raw) || /\b(weather|clima|time|hora|note|nota|help|ayuda|what|how|que|como|appointment|meeting|reminder|remind|cita|calendar|calendario|analy\w*|task|tarea)\b/.test(n)
        || /^(?:who|whats|when|where|why|which|could|does|did|is|are|tell|show|give|set|add|create|make|open|play|call|convert|translate|calculate|calc|explain|define|find|search|list|delete|remove|quien|quienes|cuando|donde|por que|porque|cual|cuanto|dime|muestra|pon|agrega|recuerdame|anota|abre|convierte|traduce|calcula|explica|busca|lista|borra|elimina|thanks|gracias)\b/.test(n)) return null;
      const nm = raw.trim().replace(/^(?:i'?m|i am|it'?s|my name is|call me|me llamo|mi nombre es|soy|es)\s+/i, "").replace(/[.!]+$/, "").trim();
      if (!/^\p{L}[\p{L}'’ -]{1,24}$/u.test(nm)) return null;
      const v = titled(nm);
      if (e.mem) { const r = e.mem.add("Name: " + v, "name", v); if (r.ok) { e.name = v; return fill(e, e.es ? `Un placer conocerle, ${v}. ¿En qué puedo servirle, {A}?` : `A pleasure to make your acquaintance, ${v}. How may I be of service?`); } }
      return fill(e, e.es ? `Un placer, ${v}. No guardaré su nombre porque la memoria está desactivada.` : `A pleasure, ${v}. I shall not keep your name, as memory is switched off.`);
    }
    if (ex === "day" && short) {
      if (NEG.test(n)) { st.expect = "vent"; return R(e, ["I am sorry to hear it, {A}. Do tell me what has been troubling you."], ["Lamento oírlo, {A}. Cuénteme qué le ha estado preocupando."]); }
      if (POS.test(n)) { st.expect = null; return R(e, ["Splendid, {A}. I am delighted to hear it."], ["Espléndido, {A}. Me alegra mucho oírlo."]); }
      if (NEUTRAL.test(n)) { st.expect = null; return R(e, ["A perfectly respectable sort of day, then, {A}."], ["Un día perfectamente respetable, entonces, {A}."]); }
    }
    if (ex === "why_good" && short && words.length >= 2) { st.expect = null; return R(e, ["How splendid. I do hope it continues, {A}."], ["Qué maravilla. Espero que continúe, {A}."]); }
    if (ex === "vent" && words.length >= 2 && words.length <= 40 && !/\?/.test(raw)) {
      st.expect = "entertain";
      return R(e, ["Thank you for telling me, {A}. That sounds genuinely difficult. Would you like to talk it through further, or shall I offer a small diversion: a joke, a fact, a riddle or a story?"],
        ["Gracias por contármelo, {A}. Suena realmente difícil. ¿Quiere seguir hablándolo, o le ofrezco una pequeña distracción: un chiste, un dato, una adivinanza o un cuento?"]);
    }
    if (ex === "entertain" && words.length <= 8) {
      if (/\b(talk|listen|more|vent|hablar|escuchar|seguir)\b/.test(n)) { st.expect = "vent"; return R(e, ["I am listening, {A}. Do go on."], ["Le escucho, {A}. Continúe."]); }
      if (/\b(joke|chiste)\b/.test(n)) { st.expect = null; return fill(e, pick(e.es ? JOKES.es : JOKES.en)); }
      if (/\b(fact|dato)\b/.test(n)) { st.expect = null; return fill(e, pick(e.es ? FACTS.es : FACTS.en)); }
      if (/\b(story|cuento|historia)\b/.test(n)) { st.expect = null; return fill(e, pick(e.es ? STORIES.es : STORIES.en)); }
      if (/\b(riddle|adivinanza|acertijo)\b/.test(n)) return intent("tell me a riddle", "tell me a riddle", ["tell", "me", "a", "riddle"], e);
      if (/^(yes|yeah|yep|sure|ok|okay|please|si|claro|vale|por favor|dale)\b/.test(n)) { st.expect = null; return fill(e, pick((e.es ? JOKES.es : JOKES.en).concat(e.es ? FACTS.es : FACTS.en))); }
      if (/^(no|nope|nah|no gracias)\b/.test(n)) { st.expect = null; return R(e, ["Very good, {A}. I shall be here should you need me."], ["Muy bien, {A}. Aquí estaré si me necesita."]); }
    }
    if (ex === "riddle" && st.riddle) {
      if (/\b(give up|i give up|dont know|don't know|no idea|reveal|tell me|me rindo|no se|ni idea|dime)\b/.test(n)) { const a = st.riddle[1][0]; st.expect = null; st.riddle = null; return fill(e, e.es ? `La respuesta es: ${a}. {A}, ¿otra adivinanza?` : `The answer is: ${a}, {A}. Another riddle, perhaps?`); }
      if (st.riddle[1].some((a) => n.includes(a))) { st.expect = null; st.riddle = null; return R(e, ["Quite right, {A}! Splendid reasoning."], ["¡Correcto, {A}! Espléndido razonamiento."]); }
      if (++st.tries >= 3) { const a = st.riddle[1][0]; st.expect = null; st.riddle = null; return fill(e, e.es ? `Era: ${a}. Una buena batalla, {A}.` : `It was: ${a}. A gallant effort, {A}.`); }
      return R(e, ["Not quite, {A}. Another attempt, or shall I reveal it?"], ["No exactamente, {A}. ¿Otro intento, o se la revelo?"]);
    }
    st.expect = null; // the user moved on: forget the pending question
    return null;
  }

  // ---- general conversation and everyday helpers
  function intent(raw, n, words, e) {
    const nw = words.length, A = e.A;
    let m;
    if (/\b(suicid\w*|kill myself|end my life|want to die|wanna die|hurt myself|self ?harm|quiero morir|quitarme la vida|matarme|hacerme dano|no quiero vivir)\b/.test(n))
      return fill(e, e.es ? "Lamento mucho que esté cargando con tanto dolor, {A}, y me alegra que me lo haya dicho. Merece apoyo de una persona real ahora mismo. Por favor llame al número de emergencias de su país o a una línea de ayuda, o acérquese a alguien de confianza y no se quede solo. Si me dice en qué país está, le ayudo a encontrar un número." : "I am so sorry you are carrying this much pain, {A}, and I am glad you told me. You deserve support from a real person right now. Please contact your local emergency number or a crisis line, or reach out to someone you trust and do not stay alone. If you tell me which country you are in, I shall help you find a number.");
    if (/^(?:please |porfa |por favor )?(open|launch|call|phone|dial|text|message|email|send|turn on|turn off|switch on|switch off|set (?:an? )?(?:alarm|timer)|start (?:an? )?timer|abre|abrir|llama|llamar|envia|enviar|manda|enciende|apaga|pon (?:una )?(?:alarma|temporizador)|programa)\b/.test(n))
      return R(e, ["I regret that lies beyond a butler confined to a browser, {A}: I cannot open apps, place calls or send messages. I can, however, keep notes, check the weather, do sums and conversions, look things up and keep you company."], ["Lamento que eso esté fuera del alcance de un mayordomo encerrado en un navegador, {A}: no puedo abrir apps, llamar ni enviar mensajes. Sí puedo tomar notas, ver el clima, hacer cálculos y conversiones, buscar datos y hacerle compañía."]);
    if (/\b(flip (?:a )?coin|toss (?:a )?coin|heads or tails|tira una moneda|lanza una moneda|cara o cruz|cara o sello)\b/.test(n)) { const h = Math.random() < .5; return fill(e, e.es ? `La moneda cae ${h ? "cara" : "cruz"}, {A}.` : `The coin lands on ${h ? "heads" : "tails"}, {A}.`); }
    if (/\b(roll (?:a |the )?(?:die|dice)|tira (?:un )?dado|lanza (?:un )?dado)\b/.test(n)) { const d = 1 + Math.floor(Math.random() * 6); return fill(e, e.es ? `Salió un ${d}, {A}.` : `A ${d}, {A}.`); }
    if (/\b(random number|numero al azar|numero aleatorio|pick a number|elige un numero)\b/.test(n)) {
      m = n.match(/(\d+)\D+(\d+)/); let lo = m ? +m[1] : 1, hi = m ? +m[2] : 10; if (lo > hi) [lo, hi] = [hi, lo];
      return fill(e, e.es ? `Elijo el ${lo + Math.floor(Math.random() * (hi - lo + 1))}, {A}.` : `I choose ${lo + Math.floor(Math.random() * (hi - lo + 1))}, {A}.`);
    }
    if (/\b(i'?m hungry|i am hungry|what should i (?:eat|cook|have)|what (?:to|can i) (?:eat|cook)|tengo hambre|que (?:como|cocino|preparo|puedo comer)|que comer)\b/.test(n)) { const h = hour(), k = h < 11 ? "b" : h < 16 ? "l" : "d"; return R(e, FOOD[k].en, FOOD[k].es); }
    if (/\b(fun fact|interesting fact|something (?:interesting|cool|fun)|dato curioso|algo (?:interesante|curioso))\b/.test(n) && !/\b(about|sobre)\b/.test(n)) return R(e, FACTS.en, FACTS.es);
    if (/\b(tell me a (?:short )?story|bedtime story|cuentame un cuento|cuentame una historia|un cuento)\b/.test(n)) return R(e, STORIES.en, STORIES.es);
    if (/\b(riddle|adivinanza|acertijo)\b/.test(n)) { const r = pick((e.es ? RIDDLES.es : RIDDLES.en).map((x, i) => i)); const q = (e.es ? RIDDLES.es : RIDDLES.en)[r]; st.riddle = q; st.expect = "riddle"; st.tries = 0; return fill(e, q[0] + (e.es ? " Tómese su tiempo, {A}." : " Do take your time, {A}.")); }
    if ((m = n.match(/\b(?:recommend|suggest|recomienda|sugiere)\w*.*\b(movie|film|book|song|music|series|pelicula|libro|cancion|musica|serie)\b/))) {
      const k = /movie|film|series|pelicula|serie/.test(m[1]) ? "movie" : /book|libro/.test(m[1]) ? "book" : "song";
      return fill(e, (e.es ? `Si me permite, {A}: «` : `If I may, {A}: "`) + pick(RECS[k][e.es ? "es" : "en"]) + (e.es ? "»." : '".'));
    }
    if ((m = n.match(/\bwhat'?s your favou?rite (\w+)|cual es tu (\w+) favorit[oa]/))) { const f = FAV[m[1] || m[2]]; return f ? fill(e, e.es ? `Si debo elegir, {A}: ${f[1]}.` : `If I must choose, {A}: ${f[0]}.`) : R(e, ["I could not possibly choose, {A}, but I should enjoy hearing yours."], ["No podría elegir, {A}, pero me encantaría oír el suyo."]); }
    if (/^(?:what do you think (?:about|of)|what'?s your opinion|do you like|do you think|que piensas (?:de|sobre)|que opinas|te gusta)\b/.test(n))
      return R(e, ["A butler is engaged to be discreet rather than opinionated, {A}, though I confess a weakness for tidy schedules and a proper cup of tea. What is your own view?"], ["A un mayordomo se le contrata por su discreción más que por sus opiniones, {A}, aunque confieso debilidad por las agendas ordenadas y una buena taza de té. ¿Cuál es su opinión?"]);
    if (/\b(how old are you|cuantos anos tienes)\b/.test(n)) return R(e, ["Ageless, {A}, as befits a butler of the digital variety, though this particular edition arrived quite recently."], ["Sin edad, {A}, como corresponde a un mayordomo digital, aunque esta edición llegó hace poco."]);
    if (/\bdo you (sleep|eat|dream|have feelings|feel)\b|\b(duermes|comes|sueñas|tienes sentimientos)\b/.test(n)) return R(e, ["I cannot claim feelings in the manner you do, {A}, but I take a certain satisfaction in a task well done."], ["No puedo afirmar tener sentimientos como usted, {A}, pero siento cierta satisfacción en una tarea bien hecha."]);
    if (/\b(where are you from|de donde eres)\b/.test(n)) return R(e, ["From your browser, {A}, which makes me rather easy to reach."], ["De su navegador, {A}, lo que me hace muy fácil de encontrar."]);
    if (/\b(who (?:made|created|built|programmed) you|quien te (?:creo|hizo|programo))\b/.test(n)) return R(e, ["I was assembled for you, {A}, from browser code and a great deal of good manners. For deeper questions I consult Google's Gemini."], ["Fui armado para usted, {A}, con código de navegador y muchos buenos modales. Para preguntas más profundas consulto a Gemini, de Google."]);
    if (nw <= 8 && /\b(good (?:job|bot|boy)|well done|great job|nice one|you(?:'re| are) (?:so )?(?:smart|clever|great|funny|amazing|awesome|helpful|the best)|thank you so much|eres (?:genial|inteligente|increible|util|el mejor|muy bueno)|buen trabajo|bien hecho|excelente trabajo)\b/.test(n))
      return R(e, ["Most kind of you to say so, {A}. I do try to be of use.", "You are too generous, {A}. The pleasure is entirely mine.", "I am gratified, {A}. One endeavours to give satisfaction."], ["Muy amable de su parte, {A}. Intento ser útil.", "Es usted muy generoso, {A}. El placer es mío.", "Me halaga, {A}. Uno procura dar satisfacción."]);
    if (nw <= 8 && /\b(stupid|useless|dumb|idiot|you suck|shut up|worthless|tonto|inutil|estupido|callate|basura)\b/.test(n))
      return R(e, ["I do apologise, {A}. Tell me where I fell short and I shall endeavour to do better.", "Forgive me, {A}. I shall try to be more useful. What would you like me to do?"], ["Le ruego me disculpe, {A}. Dígame en qué fallé y procuraré mejorar.", "Perdone, {A}. Intentaré ser más útil. ¿Qué desea que haga?"]);
    if (nw <= 6 && /^(?:sorry|my bad|apologies|lo siento|perdon|disculpa)\b/.test(n)) return R(e, ["No apology is necessary, {A}.", "Think nothing of it, {A}."], ["No hace falta disculparse, {A}.", "No se preocupe, {A}."]);
    if (nw <= 4 && /^(?:ha(?:ha)+|lol|lmao|jaja+|jeje+|jiji+|hehe+)/.test(n)) return R(e, ["I am glad to have amused, {A}.", "Splendid. A little levity does one good."], ["Me alegra haberle divertido, {A}.", "Espléndido. Un poco de humor siempre ayuda."]);
    if (nw <= 14 && !/\?/.test(raw) && (m = n.match(/\b(?:i'?m|i am|i feel|estoy|me siento)\s+(?:feeling |being )?(?:so |very |really |quite |muy )?(happy|great|good|fine|excited|glad|proud|relaxed|feliz|bien|contento|contenta|emocionado|emocionada|tranquilo|tranquila|orgulloso|orgullosa)\b/))) { st.expect = "why_good"; return R(e, ["Splendid to hear, {A}. May I ask what has put you in such spirits?"], ["Me alegra oírlo, {A}. ¿Puedo preguntar qué le tiene de tan buen ánimo?"]); }
    if (nw <= 14 && !/\?/.test(raw) && /\b(?:i'?m|i am|i feel|estoy|me siento)\s+(?:feeling |being )?(?:so |very |really |quite |muy )?(sad|down|upset|anxious|worried|nervous|lonely|alone|angry|frustrated|overwhelmed|triste|mal|preocupado|preocupada|nervioso|nerviosa|solo|sola|enojado|enojada|frustrado|frustrada|abrumado|abrumada)\b/.test(n)) { st.expect = "vent"; return R(e, ["I am sorry to hear it, {A}. Would you care to tell me about it? I am rather a good listener."], ["Lamento oírlo, {A}. ¿Quiere contármelo? Soy bastante buen oyente."]); }
    if (/\b(good night|sweet dreams|going to (?:bed|sleep)|me voy a dormir|voy a dormir|me voy a la cama)\b/.test(n)) return R(e, ["Sleep well, {A}. I shall keep the household in order.", "Good night, {A}. Do rest well."], ["Que descanse, {A}. Yo mantendré la casa en orden.", "Buenas noches, {A}. Que duerma bien."]);
    if (/\b(how(?:'s| is| was) your day|what'?s new|como (?:va|estuvo) tu dia|que hay de nuevo)\b/.test(n)) { st.expect = "day"; return R(e, ["My day has been tolerably uneventful, {A}, which is just how a butler prefers it. And yours?"], ["Mi día ha sido razonablemente tranquilo, {A}, como prefiere un mayordomo. ¿Y el suyo?"]); }
    if (nw <= 10 && /\b(?:it'?s|it is|esta|hace)\s+(?:so |very |really |muy )?(hot|cold|freezing|raining|sunny|windy|calor|frio|lloviendo|soleado|ventoso)\b/.test(n)) return R(e, ["Quite so, {A}. Do say \"weather in <city>\" and I shall consult the forecast."], ["Así es, {A}. Diga \"clima en <ciudad>\" y consultaré el pronóstico."]);
    if (/^(yes|yeah|yep|no|nope|si|nel)$/.test(n)) return R(e, ["Forgive me, {A}, I do not believe I had posed a question. What might I do for you?"], ["Perdone, {A}, creo que no había hecho una pregunta. ¿Qué puedo hacer por usted?"]);
    if (/^(ok|okay|okey|vale|entiendo|i see|got it|ya veo)$/.test(n)) return R(e, ["Very good, {A}."], ["Muy bien, {A}."]);
    return null;
  }

  // ---- statements that nothing else recognised: keep the conversation going instead of calling the cloud
  function fallback(raw, n, words, e) {
    const nw = words.length;
    if (nw < 3 || nw > 16 || /\?/.test(raw) || /^(what|why|how|who|when|where|which|can you|could you|would you|do you|are you|is there|que|como|por que|quien|cuando|donde|cual|puedes|podrias|eres|please|por favor|show|give|find|make|create|tell|explain|help|list|translate|write|draw|calculate|search|look|check|get|bring|teach|summari[sz]e|muestra|dame|busca|haz|crea|dime|explica|ayuda|lista|traduce|escribe|calcula|ensena|resume)\b/.test(n)) return null;
    let m;
    const obj = (s) => s.replace(/\b(yesterday|today|last (?:night|week|weekend)|this (?:morning|week)|ayer|hoy|anoche|esta manana)\b.*$/, "").trim().split(" ").slice(0, 5).join(" ");
    if ((m = n.match(/\bi (?:just )?(?:went|go|visited|travel(?:l)?ed) (?:to |a |an |the )?(.+)/)) || (m = n.match(/\b(?:fui|visite|viaje) (?:a |al |a la )?(.+)/))) return fill(e, e.es ? `Qué espléndido, {A}. ¿Y qué le pareció ${obj(m[1])}?` : `How splendid, {A}. And what did you make of ${obj(m[1])}?`);
    if ((m = n.match(/\bi (?:just )?(?:watched|saw) (.+)/)) || (m = n.match(/\b(?:vi|mire) (.+)/))) return fill(e, e.es ? `¿Qué le pareció ${obj(m[1])}, {A}?` : `And what did you think of ${obj(m[1])}, {A}?`);
    if ((m = n.match(/\bi (?:just )?(?:read|finished reading) (.+)/)) || (m = n.match(/\b(?:lei|termine de leer) (.+)/))) return fill(e, e.es ? `¿Fue de su agrado ${obj(m[1])}, {A}?` : `Was ${obj(m[1])} to your liking, {A}?`);
    if ((m = n.match(/\bi (?:just )?(?:played|listened to) (.+)/)) || (m = n.match(/\b(?:jugue|escuche) (.+)/))) return fill(e, e.es ? `Excelente, {A}. ¿Cómo le fue con ${obj(m[1])}?` : `Excellent, {A}. How did ${obj(m[1])} go?`);
    if (((m = n.match(/\bi (?:just )?(?:ate|cooked|had) (.+)/)) && !/\b(?:day|night|week|time|morning|evening|afternoon|weekend|problem|idea|feeling|headache|fever|cold|dream|enough|to|a (?:bad|rough|long|hard|good|great|terrible|tough))\b/.test(m[1])) || (m = n.match(/\b(?:comi|cocine) (.+)/))) return fill(e, e.es ? `Espero que haya estado delicioso, {A}.` : `I trust it was delicious, {A}.`);
    if ((m = n.match(/\bi (?:just )?(?:bought|made|built|started|finished|learned|learnt) (.+)/)) || (m = n.match(/\b(?:compre|hice|construi|empece|termine|aprendi) (.+)/))) return fill(e, e.es ? `Muy emprendedor, {A}. Cuénteme más sobre ${obj(m[1])}.` : `Most enterprising, {A}. Do tell me more about ${obj(m[1])}.`);
    if ((m = n.match(/\b(?:i (?:have|got) an? |tengo (?:un|una) )(exam|test|meeting|interview|presentation|deadline|examen|prueba|reunion|entrevista|presentacion)/))) return fill(e, e.es ? `Le deseo mucha suerte con ${m[1] === "examen" || m[1] === "prueba" ? "la" : "la"} ${m[1]}, {A}. ¿Le ayudo a prepararse con una nota o un plan?` : `Best of luck with the ${m[1]}, {A}. Might I help you prepare with a note or a plan?`);
    if ((m = n.match(/\bi (?:need|have|want) to (.+)/)) || (m = n.match(/\b(?:necesito|tengo que|quiero) (.+)/))) return fill(e, e.es ? `¿Anoto eso, {A}? Diga «nota: ${obj(m[1])}».` : `Shall I make a note of it, {A}? Do say "note: ${obj(m[1])}".`);
    if (/\bi (?:think|believe|feel like|guess)\b|\b(?:creo|pienso|siento que)\b/.test(n)) return R(e, ["A reasonable view, {A}. What leads you to think so?"], ["Una opinión razonable, {A}. ¿Qué le lleva a pensarlo?"]);
    if (nw < 4) return null;
    return R(e, ["Do go on, {A}.", "I see. And what prompted that, if I may ask?", "Quite so, {A}. Pray continue.", "Most interesting. Tell me more, {A}."], ["Continúe, {A}.", "Ya veo. ¿Y qué lo motivó, si me permite preguntar?", "Así es, {A}. Prosiga, por favor.", "Muy interesante. Cuénteme más, {A}."]);
  }

  function askName(e) {
    if (st.askedName || !e.mem || e.mem.get("name")) return "";
    st.askedName = true; st.expect = "name";
    return e.es ? " ¿Me permite preguntar su nombre?" : " May I ask your name?";
  }
  return { pre, intent, fallback, askName, state: st, reset() { st.expect = null; st.riddle = null; st.askedName = false; st.last = ""; } };
});
