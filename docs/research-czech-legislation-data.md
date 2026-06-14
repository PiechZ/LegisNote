# Czech Legislation Data — Source Research

> **Research date:** 2026-06-14  
> **Scope:** Structured data availability for the LegisNote ingestion pipeline; proof-of-concept law: zákon č. 91/2012 Sb. (zákon o mezinárodním právu soukromém).

---

## Executive Summary

Czech legislation data is available from several sources ranging from a government open-data API to third-party services. The **recommended primary ingestion strategy** is a **structured-first approach using the e-Sbírka REST API / LawGPT.cz proxy**, with a PDF fallback only for edge cases.

### Recommendation

| Priority | Source | Strategy |
|---|---|---|
| 1 (primary) | **e-Sbírka REST API** (e-sbirka.gov.cz) | Register with Ministry of Interior; use REST API for structured JSON full text. Official, free, covers consolidated text. API stability was confirmed for production use from 2026-01-15. |
| 2 (quick bootstrap) | **LawGPT.cz proxy API** | No registration required, no API key, returns JSON/Markdown. Thin cache-through layer over e-Sbírka. Good for prototyping. Prohibits bulk browser downloads; use server-side. |
| 3 (enrichment/fallback) | **zakonyprolidi.cz API** | Returns XML/JSON. Offers consolidated text. Requires partner API key (free "test" key exists but production terms unclear). Does not require scraping. |
| 4 (last resort) | **PDF from e-Sbírka / psp.cz** | Born-digital PDFs with selectable text layer (no OCR needed). Useful only if API is unavailable for a specific act. Requires structure-extraction pass using Claude API. |

No XML/Akoma Ntoso publication exists for Czech national law. ELI is implemented only at Pillar 1 (identifier), not Pillar 2 (metadata/ontology). Czech laws are **not protected by copyright** under § 3(a) of Act No. 121/2000 Sb. (autorský zákon) and may be freely redistributed.

---

## 1. eSbírka / e-Sbírka (e-sbirka.gov.cz)

### Background

e-Sbírka (Elektronická Sbírka zákonů a mezinárodních smluv) is the official Czech government electronic collection of laws and international treaties. It entered **full operation on 1 January 2024**, replacing the previous paper-based Sbírka zákonů and Sbírka mezinárodních smluv. It is operated by the Ministry of Interior (Ministerstvo vnitra ČR) and built under the eSeL project (Asseco Central Europe, ~719 million CZK, 472 M from EU funds).

Portal URL: `https://e-sbirka.gov.cz/` (www.e-sbirka.cz redirects here via 308)

### Data Formats

- **JSON / JSON-LD** — primary open-data bulk format (available on the companion domain eselpoint.cz). JSON-LD adds only ~1 KB of linked-data metadata on top of JSON; practically identical for ingestion purposes.
- **PDF** — legally binding original gazette publications; also generated PDFs of consolidated texts.
- **DOCX** — diff/comparison output between versions.
- **XML** — NOT published by e-Sbírka. Critics (Lupa.cz) have noted the absence of XML or NDJSON streaming formats; the JSON bulk files exceed 27 GB uncompressed and are structured in a way that encourages loading the entire file into memory.

### API Access

Open data and the public REST API became available **15 January 2024** at `https://e-sbirka.gov.cz/restful-api`.

**Access model:**
- Registration required: applicants submit a form via Czech government data-box (datová zpráva) to the Ministry of Interior for approval.
- After approval: REST API access (no public rate-limit documentation found as of research date).
- Data is free of charge for both commercial and non-commercial use once registered.
- The API does **not** allow creating, modifying, or deleting data — read-only.

**Important stability caveat:** The Ministry explicitly stated that fragment identifiers and data structures **may change until 15 January 2026**. Production integrations were recommended only after that date. As of June 2026, this stability window has now passed, meaning the API should be considered stable.

### Consolidated Text (Úplné znění)

Yes — e-Sbírka provides consolidated (complete) texts incorporating all amendments, at any historical point in time. As of 2025, these are labeled "informativní znění" (informative text) rather than legally binding, because the binding status depends on the parallel rollout of e-Legislativa (scheduled through January 2027). The informative consolidated texts are practically authoritative for legal research and ingestion purposes.

### Coverage

- 47,671 legal regulations
- 121,890 temporal (versioned) texts
- 8.6 billion characters of legal text
- Coverage from 1945 onwards, selected regulations from 1918
- Links to EUR-Lex and N-Lex for EU-origin regulations

### ELI / Permanent URL

Czech Republic has implemented **ELI Pillar 1** (unique identifier) only. Pillar 2 (metadata/ontology) is not yet implemented (last EUR-Lex update: 2025-06-10).

ELI URL pattern for a given law:
```
https://e-sbirka.gov.cz/eli/cz/sb/{year}/{number}/{date}/dokument/norma
```

Non-ELI permanent URL (simpler):
```
https://e-sbirka.gov.cz/sb/{year}/{number}          # law overview
https://e-sbirka.gov.cz/sb/{year}/{number}#par_6    # specific paragraph
```

### Known Issues / Criticisms (as of 2024)

- ~100–170 regulations missing at initial launch; improved since but gaps exist.
- Open data section lacks documentation.
- Data not registered in NKOD (National Open Data Catalog) as required.
- EU-country IP restriction on bulk data access.
- No RSS feeds despite specifications requiring them.
- JSON bulk format is 27 GB+ uncompressed — impractical without streaming support.

---

## 2. ELI / Akoma Ntoso / LegalDocML Adoption in Czech Law

| Standard | Czech Status |
|---|---|
| **ELI (European Legislation Identifier)** | Pillar 1 only (unique URI scheme at e-sbirka.gov.cz). Pillar 2 (RDF metadata ontology) not implemented as of June 2026. |
| **Akoma Ntoso (AKN / LegalDocML)** | Not adopted for Czech national legislation. AKN is used by EU institutions (AKN4EU) and some EU member states, but Czech Republic publishes no AKN-formatted documents. |
| **FORMEX XML** | Used by EUR-Lex / Publications Office of the EU for EU-origin documents only, not Czech national law. |

**Conclusion:** There is no structured XML publication of Czech national law in any international legal markup standard. Ingestion must work with JSON (e-Sbírka API), proprietary XML (zakonyprolidi.cz API), or PDF.

---

## 3. Other Structured Sources

### 3.1 zakonyprolidi.cz (Zákony pro lidi)

**Description:** A widely used third-party Czech law portal operated as a public service. Offers consolidated texts of all Czech laws since 1993.

**API:** Yes — REST-style API returning XML or JSON. Documentation at `https://www.zakonyprolidi.cz/help/api.htm`.
- API key required: a "test" key exists (`apikey=test`) for exploration; a production partner key requires separate arrangement.
- Example endpoint: `http://www.zakonyprolidi.cz/api/v1/data.xml/DocTypeList?apikey=test`
- Methods include: `DocTypeList`, act full-text, paragraph-level access, versioning.

**Consolidated text:** Yes — provides current consolidated text incorporating all amendments.

**Format:** XML (primary), JSON also available.

**License:** The underlying law texts are not copyrighted (see Section 6). The platform's own value-add (formatting, annotations) is subject to their terms. Production commercial use likely requires negotiating a partner agreement. The platform explicitly states the API is intended for "partner robot access."

**Machine-accessible:** Yes, via documented API (not scraping).

**Coverage:** Comprehensive Czech law collection; free web access; app available.

**GitHub:** `https://github.com/zakonyprolidi`

### 3.2 LawGPT.cz API (proxy over e-Sbírka)

**Description:** A Czech legal AI assistant that exposes a public, unauthenticated REST API that acts as a cache-through proxy over e-Sbírka.

**API:** Yes — fully documented at `https://lawgpt.cz/api-dokumentace`.
- No API key required.
- Read-only; CORS enabled.
- Key endpoints: `/laws`, `/search`, `/paragraphs`, `/fragments`, `/fulltext`, `/versions`.
- Returns JSON UTF-8.
- Full text available in XHTML, plaintext, and **Markdown** formats — directly useful for LegisNote.

**Consolidated text:** Yes — `/fulltext` endpoint returns full consolidated wording.

**Caveats:**
- Bulk browser-side downloads are prohibited; use server-side proxying in production.
- No explicit rate limits documented; not a primary government source.
- Dependent on e-Sbírka uptime.
- Also exposes a read-only MCP server at `https://lawgpt.cz/mcp`.

### 3.3 CeskeZakony.cz

**Description:** Consumer-oriented portal syncing daily from e-Sbírka. Offers PDF and DOCX downloads per regulation. No public API. Good for manual spot-checking; not suitable for automated ingestion.

### 3.4 Sagit.cz

**Description:** Legal publisher. Provides free browsable text of laws from the Sbírka zákonů from 1993 to date. Content is HTML/web only. No public API. Consolidated texts available behind a paywall (ÚZ publications).

### 3.5 ASPI (Wolters Kluwer ČR)

**Description:** Commercial legal information system. Contains all Czech regulations from 1918, jurisprudence, EU law, legal literature. Full-text consolidated access.

**Machine-accessible:** No public API. Subscription-only. Not suitable for automated ingestion without a commercial data licence agreement with Wolters Kluwer.

**Format:** Proprietary system; no open XML/JSON export.

### 3.6 Beck-online (C.H. Beck)

**Description:** Commercial legal database with Czech legislation, case law, and commentary.

**Machine-accessible:** No public API. Subscription-only. Not suitable for automated ingestion.

### 3.7 Esipa.cz

**Description:** Commercial Czech law portal with updated consolidated texts. Provides web access but no documented public API.

### 3.8 EUR-Lex (EU-origin law only)

**Description:** EU Publications Office database. Contains EU regulations, directives, and decisions; also includes national implementing measures (NIM) for some Czech laws.

**Format:** XML (FORMEX, AKN4EU), HTML, PDF. EU-origin documents are available in structured XML.

**Relevance for Czech national law:** Limited. Czech national laws are occasionally indexed as NIM documents (e.g., zákon 91/2012 Sb. appears at EUR-Lex with URI `NIM:215839`), but the primary text source is still the Czech Sbírka zákonů. EU-origin regulations (directives, regulations) transposed into Czech law are best obtained directly from EUR-Lex in AKN4EU XML.

**Machine-accessible:** Yes — SPARQL endpoint (CELLAR) and bulk XML download. API details: `https://eur-lex.europa.eu/content/help/eurlex-content/eli.html`.

**License:** EU publications are freely reusable under the Commission's open data policy.

### 3.9 data.gov.cz (National Open Data Catalog)

**Description:** Czech national open data portal with 29,000+ datasets from 300+ providers. Contains e-Sbírka dataset metadata, but the catalog itself does not hold law text data — it points to e-Sbírka.

**Relevance:** Low — a discovery/cataloguing layer, not a data source.

### 3.10 odok.cz / eKLEP

**Description:** Pre-legislative system (ODOK, now partially replaced by eKLEP) containing draft legislation, inter-ministerial comments, and government-approved proposals.

**Relevance:** Draft/historical legislative process documents only — not consolidated law texts. Not relevant for LegisNote v1.

### 3.11 psp.cz (Chamber of Deputies)

**Description:** Czech Parliament portal with original gazette PDFs linked at `https://www.psp.cz/sqw/sbirka.sqw`. Provides links to the original gazette PDF for each law but not consolidated texts.

**Relevance:** Useful as fallback to get original PDF of a law as published.

---

## 4. Source Comparison Table

| Source | Format | Access Model | Consolidated Text? | License / Legal | Machine-Accessible? |
|---|---|---|---|---|---|
| **e-Sbírka REST API** (e-sbirka.gov.cz) | JSON, PDF | Free; registration via Ministry of Interior data-box | Yes (informative) | Public domain (§ 3 AZ) | Yes — REST API |
| **e-Sbírka Open Data** (eselpoint.cz) | JSON, JSON-LD, PDF | Free; EU IP only; no registration for bulk files | Yes | Public domain | Yes — bulk download, 27 GB+ |
| **LawGPT.cz proxy API** | JSON, XHTML, Plaintext, Markdown | Free; no key; read-only | Yes | Public domain text; platform ToS unclear | Yes — REST API, no auth |
| **zakonyprolidi.cz API** | XML, JSON | Partner API key; "test" key available | Yes | Public domain text; platform partner terms | Yes — REST API |
| **CeskeZakony.cz** | PDF, DOCX | Free (web); no API | Yes | Public domain text | No (manual download only) |
| **Sagit.cz** | HTML (free browse), print (paid) | Free for browse; paid for ÚZ publications | Yes (paid) | Public domain text | No public API |
| **ASPI (Wolters Kluwer)** | Proprietary | Subscription; data licence required | Yes | Commercial | No public API |
| **Beck-online** | Proprietary | Subscription | Yes | Commercial | No public API |
| **EUR-Lex** | XML (FORMEX, AKN4EU), HTML, PDF | Free; SPARQL/bulk | EU law only | Open (EU policy) | Yes — CELLAR SPARQL + bulk |
| **psp.cz** | PDF | Free; no API | Original text only (no amendments) | Public domain | No — HTML/PDF only |
| **data.gov.cz** | DCAT-AP metadata | Free | No (catalog only) | Open | Yes — SPARQL/API (metadata only) |

---

## 5. Specific Findings: Zákon č. 91/2012 Sb. (Zákon o mezinárodním právu soukromém)

**Identity:**
- Citation: 91/2012 Sb.
- Title: Zákon o mezinárodním právu soukromém (Act on Private International Law)
- Published: Partial issue 35 of the Sbírka zákonů, 22 March 2012
- Effective date: 1 January 2014
- Last known amendment: Act 285/2023 Sb. (effective 23 September 2023 per fulsoft.cz)

### Where to Obtain the Current Consolidated Text

| Source | URL | Format | Notes |
|---|---|---|---|
| **e-Sbírka** | `https://e-sbirka.gov.cz/sb/2012/91` | Web (HTML), PDF download | Consolidated; informative (not yet binding under e-Legislativa) |
| **LawGPT.cz API** | `GET https://lawgpt.cz/api/esbirka/laws/sb/2012/91/fulltext` | JSON/Markdown | Proxy of e-Sbírka; no auth required |
| **zakonyprolidi.cz** | `https://www.zakonyprolidi.cz/cs/2012-91` | Web HTML + API XML/JSON | Consolidated text; API key needed for programmatic access |
| **EUR-Lex** | `https://eur-lex.europa.eu/legal-content/CS/TXT/PDF/?uri=NIM:215839` | PDF only | NIM (national implementing measure) — original text, not consolidated |
| **psp.cz** | `https://www.psp.cz/sqw/sbirka.sqw?cz=91&r=2012` | Link to gazette PDF (387 KB) | Original text as promulgated, no amendments |
| **esipa.cz** | `https://esipa.cz/sbirka/sbsrv.dll/sb?DR=AZ&CP=2012s091-2023s285` | Web HTML | Consolidated through 285/2023 Sb. |
| **ASPI (Wolters Kluwer)** | `https://www.aspi.cz/products/lawText/1/74909/…` | Proprietary | Current consolidated text; subscription required |

### Is a Structured (Non-PDF) Version Available?

**Yes**, via:
1. **e-Sbírka REST API / LawGPT.cz API** — returns structured JSON with paragraph-level fragments. The LawGPT proxy's `/fulltext` endpoint can return Markdown directly, which aligns perfectly with LegisNote's storage format.
2. **zakonyprolidi.cz API** — returns XML or JSON with paragraph-level structure.

There is **no Akoma Ntoso or other standardized XML** version of this law.

### PDF Nature (Original Gazette)

The original gazette PDF (387 KB from psp.cz, linked via EUR-Lex) is **born-digital** — produced by the Tiskárna Ministerstva vnitra using professional desktop publishing software and exported as PDF with a selectable text layer. No OCR is required. The document is well-structured with Czech statutory conventions (see Section 6 below).

---

## 6. PDF Reality and Czech Law Structural Conventions

### PDF Type

All Czech Sbírka zákonů PDFs from the digital era (roughly 2000 onwards, including 91/2012 Sb.) are **born-digital** with a full selectable text layer. OCR is not needed. The Tiskárna Ministerstva vnitra produces these using typesetting tools and exports them as standard PDFs.

For regulations that pre-date digital typesetting (pre-1993, and some 1990s acts), scanned images may appear; OCR would be required. However, LegisNote v1 targets the current effective text, which is always available digitally.

### Czech Statutory Structure Conventions

Czech laws follow a consistent hierarchical structure useful for parsing:

| Level | Czech term | Notation | Example |
|---|---|---|---|
| Part | Část | Roman numeral or word | ČÁST PRVNÍ |
| Title | Hlava | Roman numeral | HLAVA I |
| Chapter | Oddíl / Kapitola | Arabic numeral | Oddíl 1 |
| Section | § (paragraf) | Arabic numeral | § 12 |
| Paragraph | odstavec | Arabic numeral in parentheses | (1), (2) |
| Letter | písmeno | lowercase letter in parentheses | a), b), c) |
| Point | bod | numeral or sub-bullet | 1., 2. |

**Key parsing signals:**
- `§` followed by a number identifies a section boundary — the primary structural unit.
- Odstavce (paragraphs) within a § are denoted by `(1)`, `(2)` at the start of a line.
- Písmena (letters) are `a)`, `b)` — indented items under an odstavec.
- Laws begin with a preamble/header: "Zákon ze dne …" followed by the chamber reference and promulgation formula.
- The effective-date clause typically appears at the end: "Tento zákon nabývá účinnosti dnem …"
- Amendments are integrated into consolidated text without markup — the clean running text is what appears.

### When PDF + Claude API Fallback is Needed

Use the PDF → Claude API pipeline only when:
- A law is so new it has not yet propagated to the e-Sbírka structured API (typically < 30 days after promulgation).
- A law is very old (pre-1993) and not available in consolidated form anywhere.
- The e-Sbírka API is unavailable or the registration is pending.

Since born-digital PDFs have clean text, the Claude API pass can focus on **structure extraction** (identifying §, odstavec, písmeno boundaries) rather than OCR correction.

---

## 7. Licensing and Legal Reuse

### Czech Law: § 3(a) of Act No. 121/2000 Sb. (Autorský zákon)

Czech copyright law explicitly excludes official works from copyright protection. Section 3(a) states:

> Copyright protection does not apply to an **official work**, such as a legal regulation, decision, public charter, publicly accessible register and collection of its documents, and also any official draft of an official work and other preparatory official documentation including the official translation of such work, Chamber of Deputies and Senate publications, a memorial chronicle of a municipality, a state symbol and symbol of a municipality, and any other such works where there is a **public interest in their exclusion from copyright protection**.

**Consequence for LegisNote:**
- Czech laws (zákon, vyhláška, nařízení vlády, ústavní zákon, etc.) as official works are **in the public domain** — they carry no copyright and may be freely reproduced, redistributed, and published in any form.
- This applies to the text of the laws themselves, not to third-party commentary or annotations added by commercial publishers.
- There is no need to license the law text from the Czech state.
- The Wikimedia Commons tag for such works is `{{PD-CzechGov}}`.

### Platform Terms Consideration

While the underlying law text is public domain, the **API services** of third parties (zakonyprolidi.cz, LawGPT.cz) may impose their own terms for high-volume or commercial use of their service (API calls, infrastructure). Always check current terms before high-volume production ingestion.

The e-Sbírka REST API specifically states that commercial use is permitted after registration.

---

## 8. Recommended Ingestion Architecture

```
For each law to ingest:

1. Try e-Sbírka REST API  →  JSON structured text, paragraph-level
        ↓ (if unavailable / pending registration)
2. Try LawGPT.cz API     →  JSON/Markdown, paragraph-level, no auth
        ↓ (if not available or outdated)
3. Try zakonyprolidi.cz API  →  XML/JSON, consolidated, partner key
        ↓ (last resort)
4. Fetch gazette PDF from e-Sbírka / psp.cz
   → text extraction (pdfminer / pdfplumber, no OCR needed)
   → Claude API structure pass (identify §/odstavec/písmeno boundaries)
   → output Markdown
```

For the PoC law 91/2012 Sb., **LawGPT.cz API is immediately usable** (no registration, returns Markdown) while the e-Sbírka API registration is being processed.

---

## 9. Unverified / Could Not Confirm

The following items could not be confirmed from publicly available sources as of this research date and should be verified directly:

1. **zakonyprolidi.cz API production terms** — The "test" API key is documented; terms for commercial/production use and whether a formal partner agreement is required could not be confirmed from public pages (both `/help/api.htm` and `/help/api-service.htm` returned HTTP 403 during research).
2. **e-Sbírka REST API rate limits** — No public documentation of per-minute or per-day request limits found. Confirm with the Ministry of Interior upon registration.
3. **LawGPT.cz API rate limits** — No explicit rate limit documentation found. The service prohibits "bulk browser downloads"; server-side usage is recommended but limits are unspecified.
4. **e-Sbírka XML bulk export** — No XML bulk download was found; only JSON/JSON-LD. If XML is needed, this must be confirmed directly with the e-Sbírka team (ELI contact: jaroslav.tomanek@mvcr.cz).
5. **e-Sbírka binding consolidated text timeline** — Binding consolidated texts (as opposed to "informative") depend on full e-Legislativa deployment, planned through January 2027. The exact rollout schedule per law is not publicly documented.
6. **zakonyprolidi.cz coverage gaps** — The site covers from 1993; pre-1993 laws on their platform have not been verified for completeness.

---

## 10. Cited URLs

### Official Czech Government Sources

- e-Sbírka portal: <https://e-sbirka.gov.cz/>
- e-Sbírka open data page: <https://e-sbirka.gov.cz/open-data>
- e-Sbírka REST API: <https://e-sbirka.gov.cz/restful-api>
- e-Sbírka permanent URL & ELI: <https://e-sbirka.gov.cz/pristup-pres-stale-url-a-eli>
- Zákon 91/2012 Sb. on e-Sbírka: <https://e-sbirka.gov.cz/sb/2012/91>
- Open data announcement (Jan 2024): <https://zakony.gov.cz/gov/otevrena-data-a-verejna-api-systemu-e-sbirka-od-15-ledna/>
- eSeL project overview: <https://zakony.gov.cz/esel/>
- Ministry of Interior — e-Sbírka & e-Legislativa: <https://mv.gov.cz/clanek/e-sbirka-a-e-legislativa.aspx>
- eSeL project (Asseco): <https://ce.asseco.com/en/portfolio/egovernment/central-shared-services/e-collection-and-e-legislation-esel-1273/>
- psp.cz — Zákon 91/2012 Sb.: <https://www.psp.cz/sqw/sbirka.sqw?cz=91&r=2012>

### Third-Party Sources

- zakonyprolidi.cz — Zákon 91/2012 Sb.: <https://www.zakonyprolidi.cz/cs/2012-91>
- zakonyprolidi.cz API help: <https://www.zakonyprolidi.cz/help/api.htm>
- zakonyprolidi.cz API methods: <https://www.zakonyprolidi.cz/help/api-methods.htm>
- zakonyprolidi.cz GitHub: <https://github.com/zakonyprolidi>
- LawGPT.cz API documentation: <https://lawgpt.cz/api-dokumentace>
- LawGPT.cz MCP integration: <https://lawgpt.cz/integrations/mcp/>
- CeskeZakony.cz: <https://ceskezakony.cz/en>
- Sagit.cz — Zákon 91/2012 Sb.: <https://www.sagit.cz/info/uz.asp?cd=5&typ=r&det=&levelid=795151>
- esipa.cz — Zákon 91/2012 Sb.: <https://esipa.cz/sbirka/sbsrv.dll/sb?DR=AZ&CP=2012s091-2023s285>
- ASPI (Wolters Kluwer): <https://www.aspi.cz/products/lawText/1/74909/129/2/zakon-c-91-2012-sb-o-mezinarodnim-pravu-soukromem/zakon-c-91-2012-sb-o-mezinarodnim-pravu-soukromem>
- dostupnyadvokat.cz analysis of e-Sbírka: <https://dostupnyadvokat.cz/en/blog/e-sbirka>

### Analysis / Commentary

- Lupa.cz — e-Sbírka open data critique: <https://www.lupa.cz/clanky/e-sbirka-ukazuje-jak-neotevirat-data/>
- Lupa.cz — e-Sbírka features review: <https://www.lupa.cz/clanky/co-nabizi-nova-e-sbirka-a-jak-se-s-ni-pracuje/>
- earchiv.cz — e-Sbírka technical deep-dive: <https://www.earchiv.cz/b24/b0115001.php3>

### Copyright / Legal Basis

- Czech Copyright Act (121/2000 Sb.) on zakonyprolidi.cz: <https://www.zakonyprolidi.cz/cs/2000-121>
- Wikimedia Commons Czech copyright rules: <https://commons.wikimedia.org/wiki/Commons:Copyright_rules_by_territory/Czech_Republic>
- WIPO Lex — Czech Copyright Act (English): <https://wipolex-res.wipo.int/edocs/lexdocs/laws/en/cz/cz029en.pdf>

### ELI / Standards

- EUR-Lex — Czech Republic ELI registration: <https://eur-lex.europa.eu/eli-register/czech-republic.html>
- EUR-Lex — ELI implementation guide: <https://eur-lex.europa.eu/eli-register/implementing_eli.html>
- AKN4EU: <https://op.europa.eu/en/web/eu-vocabularies/akn4eu>
- N-Lex Czech national database: <https://n-lex.europa.eu/n-lex/info/info-cz/index>
- EUR-Lex — Zákon 91/2012 Sb. (PDF, NIM): <https://eur-lex.europa.eu/legal-content/CS/TXT/PDF/?uri=NIM:215839>
