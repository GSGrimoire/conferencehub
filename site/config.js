// Offentlig konfiguration. Den publishable key er beregnet til browseren;
// adgangen styres af rækkesikkerheden i databasen. Læg ALDRIG en secret key her.
window.CH_CONFIG = {
  supabaseUrl: "https://vczueyxesistyzwyotyv.supabase.co",
  publishableKey: "",      // sb_publishable_... fra Supabase → Settings → API Keys
  emailLogin: false,       // slås til, når der er en egen mailafsender (SMTP)
};
