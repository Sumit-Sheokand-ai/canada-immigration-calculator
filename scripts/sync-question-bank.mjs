import { createClient } from '@supabase/supabase-js';
import {
  QUESTION_BANK_VERSION,
  countQuestionPrompts,
  fallbackQuestionBank,
} from '../src/data/questionBank.js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Missing SUPABASE_URL (or VITE_SUPABASE_URL) and/or SUPABASE_SERVICE_ROLE_KEY');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

async function run() {
  const promptCount = countQuestionPrompts(fallbackQuestionBank);
  const now = new Date().toISOString();

  const { error: deactivateError } = await supabase
    .from('question_sets')
    .update({ is_active: false, updated_at: now })
    .eq('id', 'wizard')
    .eq('is_active', true);
  if (deactivateError) throw deactivateError;

  const payload = {
    steps: fallbackQuestionBank,
    meta: {
      promptCount,
      version: QUESTION_BANK_VERSION,
      syncedAt: now,
    },
  };

  const { error: upsertError } = await supabase
    .from('question_sets')
    .upsert({
      id: 'wizard',
      source: 'baseline',
      version: QUESTION_BANK_VERSION,
      is_active: true,
      payload,
      updated_at: now,
    }, {
      onConflict: 'id,source,version',
    });
  if (upsertError) throw upsertError;

  console.log(`Question bank synced: version=${QUESTION_BANK_VERSION}, prompts=${promptCount}`);
}

run().catch((error) => {
  console.error('Failed to sync question bank:', error.message);
  process.exit(1);
});

