import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { z } from "zod";
import { structureClinicalNote } from "./clinicalParser.js";
import { supabase } from "./supabase.js";

dotenv.config();

const app = express();
const port = Number(process.env.PORT || 4000);

app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:5173"
  })
);

app.use(express.json({ limit: "5mb" }));

const generateSchema = z.object({
  originalNote: z.string().min(1, "originalNote is required")
});

const createCaseSchema = z.object({
  originalNote: z.string().min(1),
  generatedResult: z.any(),
  title: z.string().optional()
});

const updateCaseSchema = z.object({
  editedResult: z.any()
});

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, message: "Backend is running" });
});

app.post("/api/generate", (req, res) => {
  const parsed = generateSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const { title, result } = structureClinicalNote(parsed.data.originalNote);

  return res.json({
    title,
    result
  });
});

app.post("/api/cases", async (req, res) => {
  const parsed = createCaseSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const { originalNote, generatedResult, title } = parsed.data;

  const { data, error } = await supabase
    .from("clinical_cases")
    .insert({
      title: title || generatedResult?.chiefComplaint || "Untitled clinical case",
      original_note: originalNote,
      generated_result: generatedResult,
      edited_result: null,
      is_edited: false
    })
    .select("*")
    .single();

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  return res.status(201).json(data);
});

app.get("/api/cases", async (_req, res) => {
  const { data, error } = await supabase
    .from("clinical_cases")
    .select("id, title, is_edited, created_at, updated_at")
    .order("updated_at", { ascending: false });

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  return res.json(data);
});

app.get("/api/cases/:id", async (req, res) => {
  const { data, error } = await supabase
    .from("clinical_cases")
    .select("*")
    .eq("id", req.params.id)
    .single();

  if (error) {
    return res.status(404).json({ error: error.message });
  }

  return res.json(data);
});

app.put("/api/cases/:id", async (req, res) => {
  const parsed = updateCaseSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const { data, error } = await supabase
    .from("clinical_cases")
    .update({
      edited_result: parsed.data.editedResult,
      is_edited: true
    })
    .eq("id", req.params.id)
    .select("*")
    .single();

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  return res.json(data);
});

app.listen(port, () => {
  console.log(`Backend running on http://localhost:${port}`);
});