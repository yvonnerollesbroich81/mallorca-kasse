export const APP_CONFIG = Object.freeze({
  supabaseUrl: "https://ftrlfirhmnytwvxqaeam.supabase.co",
  supabasePublishableKey: "sb_publishable_TMvqViXWnnSt7KCL4KmHKA_VHbchGjC",
  tripId: "b1bf864e-1228-4fe8-8f93-e2bb909875a1",
  photoBucket: "trip-photos",
  photoPath: "b1bf864e-1228-4fe8-8f93-e2bb909875a1/mallorca-gruppe.png",
  supabaseSdkUrl: "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.4/+esm",
});

export function isConfigured() {
  return APP_CONFIG.supabaseUrl.startsWith("https://") &&
    !APP_CONFIG.supabaseUrl.includes("DEIN-PROJEKT") &&
    !APP_CONFIG.supabasePublishableKey.startsWith("DEIN_");
}
