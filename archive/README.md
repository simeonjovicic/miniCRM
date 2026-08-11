# Archiv — stillgelegte Features

Dieser Ordner liegt **außerhalb** von `backend/src` und `frontend/src`. Maven und Vite
sehen ihn nicht: Der Code wird nicht kompiliert, nicht gebündelt und landet nicht im
JAR. Er bleibt nur zum Nachschlagen und für eine mögliche Reaktivierung im Repo.

Stillgelegt am 11.08.2026.

---

## `lead-finder/`

Lead-Recherche über die Google Places API mit KI-gestützter Suchbegriff-Erweiterung.

**Backend** (`com.collabcrm.*`)

| Datei | Ursprünglicher Ort |
|---|---|
| `LeadFinderController.java` | `controller/` |
| `LeadFinderService.java`, `LeadFinderAiService.java`, `GooglePlacesClient.java` | `service/` |
| `LeadFinderRun.java`, `LeadFinderResult.java`, `LeadFinderTermCache.java` | `model/` |
| `LeadFinderRunRepository.java`, `LeadFinderResultRepository.java`, `LeadFinderTermCacheRepository.java` | `repository/` |

**Frontend**

| Datei | Ursprünglicher Ort |
|---|---|
| `LeadFinderPage.tsx` | `frontend/src/pages/` |
| `leadFinderApi.ts` | herausgelöst aus `services/api.ts` + `types/index.ts` |

**Entfallene Endpunkte:** `POST /api/lead-finder/terms`, `POST /api/lead-finder/runs`,
`GET /api/lead-finder/runs`, `GET /api/lead-finder/runs/{id}`
**Entfallene Route:** `/lead-finder`
**Entfallene Config:** `google.places.api-key`, `google.places.max-pages-per-search`
(bzw. `GOOGLE_PLACES_API_KEY`)

---

## `vorlagen/`

KI-E-Mail-Assistent (Groq / Llama 3.3 70B) mit CRM-Kontext-Anreicherung. Die Seite
war der einzige Konsument des KI-Backends, deshalb ist `AiService` mit archiviert.

**Backend** (`com.collabcrm.*`)

| Datei | Ursprünglicher Ort |
|---|---|
| `AiController.java` | `controller/` |
| `AiService.java` | `service/` |

**Frontend**

| Datei | Ursprünglicher Ort |
|---|---|
| `VorlagenPage.tsx` | `frontend/src/pages/` |
| `aiApi.ts` | herausgelöst aus `services/api.ts` |

**Entfallener Endpunkt:** `POST /api/ai/generate-email`
**Entfallene Route:** `/vorlagen`
**Entfallene Config:** `groq.api-key` (bzw. `GROQ_API_KEY`)

---

## Reaktivieren

1. Java-Dateien zurück in ihre Pakete unter `backend/src/main/java/com/collabcrm/`
   verschieben (Package-Deklarationen sind unverändert, kompilieren also sofort).
2. `*.tsx` zurück nach `frontend/src/pages/`.
3. Inhalt von `leadFinderApi.ts` / `aiApi.ts` zurück in `services/api.ts` einfügen
   (die Typen nach `types/index.ts`). `request()` ist dort modul-lokal — Code direkt
   einfügen statt importieren.
4. In `App.tsx`: Import, `<Route>` und Eintrag in `NAV_ITEMS` / `MORE_LINKS` ergänzen.
5. Config-Keys in `application.yml` wieder eintragen und die API-Keys in
   `application-local.yml` (lokal) bzw. `.env` (Pi) hinterlegen.

## Datenbank

Die Tabellen `lead_finder_run`, `lead_finder_results` und `lead_finder_term_cache`
bleiben bestehen — `ddl-auto: update` löscht nichts. Sie werden nur nicht mehr
beschrieben. Falls sie endgültig weg sollen:

```sql
DROP TABLE IF EXISTS lead_finder_results, lead_finder_run, lead_finder_term_cache CASCADE;
```
