/**
 * Knowledge Base service — frontend interface to Rust KB commands.
 * Calls Tauri invoke() for embedding generation and vector search.
 */

import { invoke } from "@tauri-apps/api/core";

export interface KbDoc {
  doc_id: string;
  project_id: string;
  title: string;
  content: string;
  source_type: string;
  created_at: string;
}

export interface KbSearchResult {
  doc_id: string;
  title: string;
  content: string;
  score: number;
}

/** Add a document to the knowledge base — generates embedding via Ollama */
export async function addDocument(
  projectId: string,
  title: string,
  content: string
): Promise<KbDoc> {
  return invoke("kb_add_document", { projectId, title, content });
}

/** Search the knowledge base by semantic similarity */
export async function searchKb(
  projectId: string,
  query: string,
  topK: number = 5
): Promise<KbSearchResult[]> {
  return invoke("kb_search", { projectId, query, topK });
}

/** List all documents in a project's knowledge base */
export async function getDocuments(projectId: string): Promise<KbDoc[]> {
  return invoke("kb_get_documents", { projectId });
}

/** Delete a document and its embedding */
export async function deleteDocument(docId: string): Promise<void> {
  return invoke("kb_delete_document", { docId });
}

/** Get concatenated context string for agent prompting */
export async function getContext(
  projectId: string,
  query: string,
  topK: number = 3
): Promise<string> {
  return invoke("kb_get_context", { projectId, query, topK });
}
