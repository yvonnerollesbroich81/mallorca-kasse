import { APP_CONFIG } from "./config.js";

export async function createSupabaseService() {
  const { createClient } = await import(APP_CONFIG.supabaseSdkUrl);
  const client = createClient(
    APP_CONFIG.supabaseUrl,
    APP_CONFIG.supabasePublishableKey,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    },
  );

  return {
    async getSession() {
      const { data, error } = await client.auth.getSession();
      if (error) throw error;
      return data.session;
    },

    onAuthStateChange(callback) {
      return client.auth.onAuthStateChange(callback);
    },

    async signIn(email, password) {
      const { data, error } = await client.auth.signInWithPassword({ email, password });
      if (error) throw error;
      return data.session;
    },

    async signOut() {
      const { error } = await client.auth.signOut();
      if (error) throw error;
    },

    async loadTripData() {
      const [participantsResult, expensesResult] = await Promise.all([
        client
          .from("participants")
          .select("id, trip_id, user_id, name, avatar_configuration, created_at")
          .eq("trip_id", APP_CONFIG.tripId),
        client
          .from("expenses")
          .select("id, trip_id, payer_id, description, amount_cents, created_at, updated_at, expense_participants(participant_id, share_cents)")
          .eq("trip_id", APP_CONFIG.tripId)
          .order("created_at", { ascending: false }),
      ]);

      if (participantsResult.error) throw participantsResult.error;
      if (expensesResult.error) throw expensesResult.error;

      return {
        participants: participantsResult.data,
        expenses: expensesResult.data.map((row) => ({
          id: row.id,
          tripId: row.trip_id,
          payerId: row.payer_id,
          description: row.description,
          amountCents: Number(row.amount_cents),
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          shares: row.expense_participants.map((share) => ({
            participantId: share.participant_id,
            shareCents: Number(share.share_cents),
          })),
        })),
      };
    },

    async getPrivatePhotoUrl() {
      const { data, error } = await client.storage
        .from(APP_CONFIG.photoBucket)
        .createSignedUrl(APP_CONFIG.photoPath, 60 * 60 * 4);

      if (error) throw error;
      return data.signedUrl;
    },

    async saveExpense(expense) {
      const { data, error } = await client.rpc("save_expense", {
        p_trip_id: APP_CONFIG.tripId,
        p_payer_id: expense.payerId,
        p_description: expense.description,
        p_amount_cents: expense.amountCents,
        p_participant_ids: expense.shares.map((share) => share.participantId),
        p_share_cents: expense.shares.map((share) => share.shareCents),
        p_expense_id: expense.id ?? null,
      });

      if (error) throw error;
      return data;
    },

    async deleteExpense(expenseId) {
      const { error } = await client.rpc("delete_expense", {
        p_expense_id: expenseId,
      });
      if (error) throw error;
    },

    subscribeToChanges(callback) {
      return client
        .channel(`mallorca-kasse-${APP_CONFIG.tripId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "trip_versions",
            filter: `trip_id=eq.${APP_CONFIG.tripId}`,
          },
          callback,
        )
        .subscribe();
    },

    async removeChannel(channel) {
      if (channel) await client.removeChannel(channel);
    },
  };
}
