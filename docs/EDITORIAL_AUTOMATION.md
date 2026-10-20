# Redazione Aurelius — contratto operativo pubblico

Leggere `content/editorial/policy.json`, `content/manifest.json`, ultime 7 edizioni e `content/feedback/ratings.json`. Nessun accesso a calendario, routine, salute, presenza o archivi personali. Le preferenze condivise non sono stato di lettura. Nessun voto significa assenza di evidenza.

Scegliere i tre temi autonomamente, con rotazione dei sette filoni e tradizioni della policy. Evitare titoli e testi già pubblicati. Non assegnare punteggi alle proposte non valutate. Moderare cambi di affinità: `verbose` riguarda prima lo stile; `too_short` con voto alto invita ad approfondire.

Ricercare realmente fonti primarie e leggere i passaggi utilizzati. Produrre italiano originale: filosofia 500–800 parole; biblioteca 2200–3200; radar 1200–2000. Non promettere riassunti integrali di libri non consultati. Esplicitare base documentale e interpretazioni. Brevi citazioni solo con diritti verificati; nessun collage di un'opera contemporanea. Religioni senza proselitismo, distinguendo storia, teologia e interpretazione. Nessuna API AI a consumo.

Radar: verificare data evento/pubblicazione, paper, repository e condizioni dei benchmark. Per microalghe cercare ceppo, configurazione, scala, produttività/unità, luce, CO2, condizioni e limiti; niente marketing/bandi. Se evidenza insufficiente, scrivere un evergreen esplicitamente dichiarato; ridurre il testo soltanto con `kind: reduced` e motivo nella base documentale. Non inventare notizie o risultati di Harness²/Liquid.

Formato: una singola edizione completa `content/editions/YYYY-MM-DD.json` con tre articoli incorporati, esattamente come il primo esempio reale. Usare ID stabili nuovi, sezioni di paragrafi semplici, fonti HTTPS con edizione e data di consultazione; no HTML remoto. Notizie: `event_date` e `publication_date` obbligatorie. Tutte le date di edizione sono Europe/Rome. Aggiornare `manifest.json` nello stesso commit; `latest` è la massima data pubblicata. Per riserva, inserire edizioni già datate in `content/reserve/` e nomi in `editorial/queue.json` senza anticiparle nel manifest. Il job gratuito rilascia soltanto riserve autentiche; la riserva iniziale è vuota.

Eseguire `npm ci`, `npm test`, `npm run validate:content`, `npx playwright test`. Controllare anche accuratezza, leggibilità, ripetizioni e fedeltà alle fonti: lo schema valido non prova la semantica. Se uno di questi controlli fallisce, conservare l'ultima edizione valida, senza testi fittizi e senza claim di successo.

Lavorare in branch/PR del repository `AlbertoRacerro/Aurelius`, con modifiche esclusivamente a `content/`. Verificare gli esiti CI dell'esatto head e rileggere il contenuto prima di fare merge con expected-head. Niente deploy software o Worker per pubblicare un'edizione. La PWA legge direttamente JSON pubblici da GitHub raw, con cache locale di sette edizioni: un commit da Actions non richiede una nuova build Pages. Non pubblicare dati di test nei voti reali. Non modificare `src/`, Worker, segreti, piano o strumenti senza una nuova richiesta.

Verificare dopo il merge gli URL raw dell'edizione e manifest; segnalare risultato e link reali, o il blocco concreto. Nessun invio email/Slack.
