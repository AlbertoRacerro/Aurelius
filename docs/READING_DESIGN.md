# Lettura e pianificazione — 21 ottobre 2026

## Evidenza e decisioni

Non esiste una coppia di colori o un font dimostrati ottimali per tutti. Gli studi sulla polarità mostrano un vantaggio prestazionale del testo scuro su sfondo chiaro in diversi compiti; non provano che un determinato beige prevenga affaticamento o danni oculari. La ricerca sui font mostra differenze individuali, e preferenza e velocità non coincidono necessariamente. Non vendere Georgia come font clinicamente anti-affaticamento.

- Buchner, Mayr, Brandt (2009), *The advantage of positive text-background polarity is due to high display luminance*, Ergonomics 52:882–886, DOI 10.1080/00140130802641635: https://doi.org/10.1080/00140130802641635
- Wallace e colleghi (2022), *Towards Individuated Reading Experiences*, TOCHI, DOI 10.1145/3502222: https://research.adobe.com/publication/towards-individuated-reading-experiences-different-fonts-increase-reading-speed-for-different-individuals/
- Microsoft Typography, Georgia progettato per lo schermo: https://learn.microsoft.com/en-us/typography/font-list/georgia
- W3C WCAG 2.2, contrasto minimo del testo normale 4,5:1: https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html

Scelta di progetto, non risultato sperimentale: Carta predefinita indipendente dal tema scuro del sistema (`#e9e6de` / `#454942`), alternativa Grigio (`#dce0dd` / `#414a45`) e Sera (`#272d2a` / `#bcc4b9`). Test browser calcolano il contrasto reale dei tre temi e verificano >=4,5:1 per il corpo. Testo mai ridotto a grigio quasi indistinguibile dallo sfondo. Georgia 20 px come punto di partenza, alternativa carattere di sistema, dimensioni 18–28 px; interlinea 1,65, larghezza massima 62ch, allineamento a sinistra. Questi parametri sono scelte regolabili, non prescrizioni mediche. Le preferenze si salvano separatamente sul dispositivo. Verificare il comfort effettivo sul proprio iPad/iPhone: i test non misurano affaticamento umano.

## Home e ripianificazione

Ordine: Adesso e prossimo blocco; calendario locale indicativo e consiglio; Appunti; checklist con attività aperte senza scadenza o entro oggi e completate oggi; programma di oggi; focus e controlli secondari. L'attività attuale ha testo e `aria-current`, quelle passate fondo attenuato. Il calendario usa i dati già presenti esclusivamente sul dispositivo e la stessa distinzione del calendario di sospensione; non deduce ovulazione o stati d'animo.

Il selettore delle durate serve anche alla ripianificazione del solo tempo futuro, dal box Adesso o da un blocco futuro del programma. Salva un override della data; non registra ore svolte, non modifica modello settimanale o diario. 33 minuti su 120: massimo 75 minuti assegnabili in quarti d'ora, residuo 12 sull'attività originale. Gli orari supportano minuti interi: se sono già trascorsi secondi del minuto corrente l'inizio è arrotondato al minuto successivo, mai retrodatato. Al salvataggio si ricalcolano disponibilità e conflitti e si rilegge lo stato locale. Se il blocco è cambiato nel frattempo si chiede di riaprirlo. La porzione trascorsa conserva ID e note originali. I blocchi notturni mantengono la data corretta; le transizioni DST che cambiano la durata del blocco richiedono il normale editor del Piano.

Fonti, limiti e protocolli editoriali: `EDITORIAL_AUTOMATION.md`. Nuovo formato retrocompatibile con elenchi puntati e confronti a barre numerici, con fonte e unità obbligatorie; nessun grafico creato senza dati confrontabili.
