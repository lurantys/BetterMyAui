"use server";

import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

export async function signUp(formData: FormData) {
  const supabase = await createClient();

  const name = formData.get("name") as string;
  const data = {
    email: formData.get("email") as string,
    password: formData.get("password") as string,
    options: {
      data: {
        full_name: name,
      },
    },
  };

  const { data: result, error } = await supabase.auth.signUp(data);

  if (error) {
    return { error: error.message };
  }

  if (result.user) {
    await prisma.profile.upsert({
      where: { authUserId: result.user.id },
      update: { fullName: name },
      create: {
        id: result.user.id,
        authUserId: result.user.id,
        fullName: name,
      },
    });
  }

  return { success: true };
}

export async function signIn(formData: FormData) {
  const supabase = await createClient();

  const data = {
    email: formData.get("email") as string,
    password: formData.get("password") as string,
  };

  const { error } = await supabase.auth.signInWithPassword(data);

  if (error) {
    return { error: error.message };
  }

  return { success: true };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return { success: true };
}

export async function getUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

export async function getProfile() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  let profile = await prisma.profile.findUnique({
    where: { authUserId: user.id },
  });

  if (!profile) {
    profile = await prisma.profile.create({
      data: {
        id: user.id,
        authUserId: user.id,
        fullName: user.user_metadata?.full_name ?? user.email ?? "Student",
      },
    });
  }

  return profile;
}

export async function updateProfile(fields: { major?: string; minor?: string }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  await prisma.profile.upsert({
    where: { authUserId: user.id },
    update: fields,
    create: {
      id: user.id,
      authUserId: user.id,
      fullName: user.user_metadata?.full_name ?? user.email ?? "Student",
      ...fields,
    },
  });

  return { success: true };
}
