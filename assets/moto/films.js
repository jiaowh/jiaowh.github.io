/* ================================================================
   MOTO VAULT — trip films: the edited summary video of a trip.
   A film linked to a journey screens at the top of that journey's
   page (see 北海道). A film whose "journey" doesn't match any trip
   is dormant — it appears nowhere until you build that trip.

   HOW TO ADD / LINK A FILM
     1. python assets/moto/build.py video path\to\film.mov <name>
        -> assets/moto/video/<name>.mp4 + <name>-poster.webp
     2. add or edit an entry below, pointing "journey" at the trip id
        it summarizes (the "id" field of a journey in journeys.js):
        {"video":"<name>", "title":"…", "journey":"<journey id>", "date":"YYYY-MM-DD"}
        - "date" is optional, shown on the film strip
   Titles below were guessed from the filenames — rename freely.
   Keep the body valid JSON (double quotes, no trailing commas).

   PENDING: kita / monochro / 夢旅人 are trip films with no trip yet.
   Build those trips in the Studio, then set their "journey" id here.
   ================================================================ */
const FILMS =
[
 {"video": "hokkaido", "title": "北海道", "journey": "hokkaido", "date": ""},
 {"video": "kita", "title": "北", "journey": null, "date": ""},
 {"video": "monochro", "title": "モノクロ", "journey": null, "date": ""},
 {"video": "yumetabibito", "title": "夢旅人", "journey": null, "date": ""}
]
;
