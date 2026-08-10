import createContextHook from "@nkzw/create-context-hook";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Session } from "@supabase/supabase-js";
import { useCallback, useEffect, useMemo, useState } from "react";

import { supabase } from "@/lib/supabase";
import type { UserRole } from "@/types/db";

interface SignUpParams {
  email: string;
  password: string;
  role: "doctor" | "patient";
  firstName: string;
  lastName: string;
  dateOfBirth?: string;
}

export const [AuthProvider, useAuth] = createContextHook(() => {
  const [session, setSession] = useState<Session | null>(null);
  const [isAuthReady, setIsAuthReady] = useState<boolean>(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    supabase.auth
      .getSession()
      .then(({ data }) => {
        setSession(data.session);
      })
      .catch((err: unknown) => {
        console.error("[auth] getSession failed", err);
      })
      .finally(() => {
        setIsAuthReady(true);
      });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
    });

    return () => {
      sub.subscription.unsubscribe();
    };
  }, []);

  const userId = session?.user?.id ?? null;

  const roleQuery = useQuery({
    queryKey: ["user-role", userId],
    enabled: userId !== null,
    queryFn: async (): Promise<UserRole | null> => {
      const { data, error } = await supabase
        .from("users")
        .select("role")
        .eq("id", userId as string)
        .maybeSingle();
      if (error) throw error;
      return (data?.role as UserRole | undefined) ?? null;
    },
  });

const signIn = useCallback(
  async (email: string, password: string): Promise<void> => {
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) throw error;
    queryClient.clear();
  },
  [queryClient],
);

  const signUp = useCallback(
    async ({
      email,
      password,
      role,
      firstName,
      lastName,
      dateOfBirth,
    }: SignUpParams): Promise<void> => {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            role,
            language: "uk",
            first_name: firstName.trim(),
            last_name: lastName.trim(),
          },
        },
      });
      if (error) throw error;

      // Email confirmation is disabled in Supabase, so signUp returns an
      // active session. If it's ever missing, sign in with the same
      // credentials to establish one (required for RLS on profile insert).
      let newUserId = data.session?.user?.id ?? null;

      if (newUserId === null) {
        const { data: signInData, error: signInError } =
          await supabase.auth.signInWithPassword({
            email: email.trim(),
            password,
          });
        if (signInError) {
          throw new Error(`Не вдалося увійти: ${signInError.message}`);
        }
        newUserId = signInData.session?.user?.id ?? null;
      }

      if (newUserId === null) {
        throw new Error("Не вдалося створити сесію. Спробуйте ще раз.");
      }

      if (role === "doctor") {
        const { error: profileError } = await supabase
          .from("doctor_profiles")
          .insert({
            user_id: newUserId,
            first_name: firstName.trim(),
            last_name: lastName.trim(),
            specialization: "",
            city: "",
            country: "",
          });
        if (profileError) {
          console.error("[auth] doctor profile insert failed", profileError);
          throw new Error(
            `Помилка збереження профілю лікаря: ${profileError.message}`,
          );
        }
      } else {
        const { error: profileError } = await supabase
          .from("patient_profiles")
          .insert({
            user_id: newUserId,
            first_name: firstName.trim(),
            last_name: lastName.trim(),
            date_of_birth:
              dateOfBirth !== undefined && dateOfBirth.length > 0
                ? dateOfBirth
                : "2000-01-01",
            city: "",
            country: "",
          });
        if (profileError) {
          console.error("[auth] patient profile insert failed", profileError);
          throw new Error(
            `Помилка збереження профілю пацієнта: ${profileError.message}`,
          );
        }
      }
    },
    [],
  );

  const signOut = useCallback(async (): Promise<void> => {
    await supabase.auth.signOut();
    queryClient.clear();
  }, [queryClient]);

  return useMemo(
    () => ({
      session,
      userId,
      isAuthReady,
      role: roleQuery.data ?? null,
      isRoleLoading: userId !== null && roleQuery.isPending,
      signIn,
      signUp,
      signOut,
    }),
    [
      session,
      userId,
      isAuthReady,
      roleQuery.data,
      roleQuery.isPending,
      signIn,
      signUp,
      signOut,
    ],
  );
});
