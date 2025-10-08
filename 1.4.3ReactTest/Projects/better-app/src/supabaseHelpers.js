// src/supabaseHelpers.js
import { supabase } from "./supabaseClient";

// Save encrypted data to Supabase
export async function saveBackup(userId, encryptedPayload) {
  return supabase
    .from("progress_backups")
    .upsert({
      user_id: userId,
      encrypted_payload: encryptedPayload,
      updated_at: new Date(),
    });
}

// Load encrypted data from Supabase
export async function loadBackup(userId) {
  const { data, error } = await supabase
    .from("progress_backups")
    .select("encrypted_payload")
    .eq("user_id", userId)
    .single();

  if (error) throw error;
  return data.encrypted_payload;
}
