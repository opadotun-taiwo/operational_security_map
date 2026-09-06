import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function testConnection() {
  console.log('Testing connection to Supabase...');
  const { data, error } = await supabase.from('security_events').select('*');
  
  if (error) {
    console.error('Supabase Error:', error);
  } else {
    console.log('Supabase Success. Rows returned:', data.length);
    if (data.length > 0) {
      console.log('First row sample:', data[0]);
    } else {
      console.log('The table is accessible, but it is currently empty.');
    }
  }
}

testConnection();
