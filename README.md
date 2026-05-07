# Clinical Note Structuring Tool

A full-stack web application for converting unstructured clinical notes into structured, reviewable information and a revised admission-supporting HPI.

This project was built for the AHMC AI Fullstack Engineer take-home exercise. The tool allows a user to paste an unstructured ER or H&P note, generate structured clinical fields, review and edit the generated output, save the case, and reopen previously saved notes.

## Live Demo

Frontend: https://ahmc-clinical-note-tool.vercel.app
Backend health check: https://ahmc-clinical-note-tool.onrender.com/api/health  

## Features

- Paste an unstructured clinical note into a text area
- Generate a structured result with:
  - Chief Complaint
  - HPI Summary
  - Key Findings
  - Suspected Condition(s)
  - Disposition Recommendation
  - Uncertainties / Missing Information
  - Revised HPI
- Review and edit generated fields before saving
- Clearly distinguish machine-generated content from user-edited content
- Save cases to a database
- List and reopen previously saved cases
- Use deterministic clinical rules rather than relying heavily on an LLM

## Architecture Overview

The application is split into a React frontend and an Express backend.

```txt
Frontend: React + TypeScript + Vite
Backend: Node.js + Express + TypeScript
Database: Supabase Postgres
Clinical logic: deterministic rule-based parser
```

The frontend sends pasted clinical text to the backend. The backend runs the rule-based clinical parser, returns structured JSON, and stores generated or user-edited results in Supabase.

## Tech Stack

### Frontend

- React
- TypeScript
- Vite
- CSS

I chose this stack because it is lightweight, fast to build with, and commonly used for full-stack take-home projects.

### Backend

- Node.js
- Express
- TypeScript
- Zod for request validation
- Supabase client for database access

Express keeps the API simple and easy to inspect. TypeScript and Zod help keep the API inputs and structured output safer.

### Database

- Supabase Postgres

Supabase was used because it provides a hosted Postgres database and works well with a small deployed full-stack application.

## Clinical Structuring Approach

The application uses a deterministic rule-based parser focused on the diabetes/DKA case domain from the provided materials.

The parser extracts:

- Patient demographics
- Chief complaint or inferred chief complaint
- Relevant symptoms
- Exam findings
- Lab abnormalities
- Suspected diagnoses
- ED treatments
- Admission-level disposition signals
- Missing or uncertain information

The parser then generates a structured summary and Revised HPI using fixed templates. This approach was chosen because the assignment specifically valued deterministic, explainable logic over heavy reliance on a black-box LLM.

## Revised HPI Generation

The Revised HPI is generated with this pattern:

```txt
patient context → symptom timeline → exam findings → objective labs → documented diagnosis → ED treatment → admission reasoning
```

For DKA cases, the parser emphasizes admission-supporting evidence such as altered mental status, ketones, severe acidosis, low bicarbonate or CO2, insulin infusion, IV fluid support, and ICU-level monitoring.

The generated HPI avoids adding facts that are not present in the original note.

## Handling Uncertainty and Missing Information

The parser explicitly records uncertainty when the source note includes or implies missing information, such as:

- History limited by altered mentation
- Chief complaint not clearly labeled
- Diabetes type unclear
- Social or family history unknown
- Possible infection considered but not confirmed
- Medication reason not confirmed

When the chief complaint is missing, the tool infers a reasonable complaint from documented symptoms and findings, while still noting that the chief complaint was inferred.

## API Endpoints

### `GET /api/health`

Returns backend health status.

### `POST /api/generate`

Generates structured clinical output from an original note.

Request:

```json
{
  "originalNote": "clinical note text"
}
```

Response:

```json
{
  "title": "case title",
  "result": {
    "chiefComplaint": "...",
    "hpiSummary": "...",
    "keyFindings": [],
    "suspectedConditions": [],
    "dispositionRecommendation": "Admit",
    "uncertainties": [],
    "revisedHpi": "...",
    "evidence": {},
    "generatedBy": "rule_based_engine"
  }
}
```

### `POST /api/cases`

Saves a generated case.

### `GET /api/cases`

Lists saved cases.

### `GET /api/cases/:id`

Retrieves one saved case.

### `PUT /api/cases/:id`

Saves user-edited structured output.

## Database Schema

The main table is `clinical_cases`.

```sql
create table clinical_cases (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  original_note text not null,
  generated_result jsonb not null,
  edited_result jsonb,
  is_edited boolean not null default false,
  source_type text default 'manual_paste',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

## Running Locally

### Prerequisites

- Node.js 20+
- npm
- Supabase project

### Backend Setup

```bash
cd backend
npm install
```

Create `backend/.env`:

```env
PORT=4000
FRONTEND_URL=http://localhost:5173
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-secret-key
```

Run the backend:

```bash
npm run dev
```

The backend runs at:

```txt
http://localhost:4000
```

### Frontend Setup

```bash
cd frontend
npm install
```

Create `frontend/.env`:

```env
VITE_API_BASE_URL=http://localhost:4000
```

Run the frontend:

```bash
npm run dev
```

The frontend runs at:

```txt
http://localhost:5173
```

## Verification

I verified correctness by testing the parser against the provided diabetes/DKA case pattern.

Example test note:

```txt
34F PMH IDDM and HTN presented via EMS from home for altered mental status. History was limited by mentation. Per ED staff, patient had 3 days of nausea, vomiting, and weakness. On exam, she was ill-appearing, lethargic, mildly tachypneic, mildly tachycardic, not oriented to self, and responding to painful stimuli without focal neurologic deficit. Labs showed glucose 793, acetone large, pH 7.28, bicarbonate 7, CO2 7, sodium 129, creatinine 1.6, WBC 15.7, and lactic acidosis. ED clinicians documented diabetic ketoacidosis with elevated anion gap metabolic acidosis. Management included insulin drip, IV fluids, empiric antibiotics for possible infection, electrolyte monitoring, serial laboratory testing, and ICU admission.
```

Expected behavior:

- Chief Complaint: Altered mental status and hyperglycemia
- Suspected Condition: Diabetic ketoacidosis
- Disposition Recommendation: Admit
- Key Findings include severe hyperglycemia, large acetone, pH 7.28, bicarbonate 7, altered mental status, insulin drip, IV fluids, and ICU-level care
- Uncertainties include limited history and unconfirmed possible infection
- Revised HPI supports inpatient admission based on documented metabolic derangement and treatment intensity

I also verified:

- Frontend generation flow
- Editing generated fields
- Saving new cases
- Saving edited cases
- Reopening saved cases
- Backend TypeScript build
- Frontend production build

## AI Tool Usage

I used ChatGPT as an AI-assisted development tool for:

- Interpreting the assignment requirements
- Planning the full-stack architecture
- Drafting the initial frontend and backend structure
- Designing the deterministic parser logic
- Reviewing generated output for clinical consistency
- Improving README wording

I manually reviewed and modified the implementation, especially:

- Rule-based extraction patterns
- DKA admission logic
- Revised HPI template wording
- Supabase database integration
- Frontend edit/save/reopen workflow
- Output verification against expected case facts

No LLM is used at runtime in the application. The clinical note generation is deterministic and rule-based.

## If I Had More Time

With more time, I would improve the project by:

- Adding unit tests for the parser
- Adding more robust section detection for very messy notes
- Supporting additional diagnosis domains beyond diabetes/DKA
- Adding confidence scores for extracted facts
- Showing source evidence snippets next to each generated field
- Adding authentication and per-user saved cases
- Improving audit history for edits
- Adding more detailed validation for clinical lab thresholds