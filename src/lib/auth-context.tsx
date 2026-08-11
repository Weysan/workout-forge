"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  deleteUser,
  onAuthStateChanged,
  reauthenticateWithPopup,
  signInWithPopup,
  signOut as firebaseSignOut,
  type User,
} from "firebase/auth";

import { appleProvider, getFirebaseAuth, googleProvider } from "@/lib/firebase";
import { deleteAllUserData } from "@/lib/firestore/profile";

type Provider = "google" | "apple";

interface AuthContextValue {
  user: User | null;
  /** True until the first auth state resolves — distinct from "signed out". */
  initialising: boolean;
  signIn: (provider: Provider) => Promise<void>;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [initialising, setInitialising] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(getFirebaseAuth(), (nextUser) => {
      setUser(nextUser);
      setInitialising(false);
    });
    return unsubscribe;
  }, []);

  const signIn = useCallback(async (provider: Provider) => {
    const auth = getFirebaseAuth();
    await signInWithPopup(
      auth,
      provider === "google" ? googleProvider() : appleProvider(),
    );
  }, []);

  const signOut = useCallback(async () => {
    await firebaseSignOut(getFirebaseAuth());
  }, []);

  const deleteAccount = useCallback(async () => {
    const auth = getFirebaseAuth();
    const current = auth.currentUser;
    if (!current) return;

    // Documents first: once the auth user is gone the security rules reject
    // every write, which would strand the training data in Firestore forever.
    await deleteAllUserData(current.uid);

    try {
      await deleteUser(current);
    } catch (error) {
      // Firebase requires a fresh credential for destructive account changes.
      // The sign-in is old if the tab has been open a while, so re-prompt once.
      if (
        error instanceof Error &&
        "code" in error &&
        (error as { code?: string }).code === "auth/requires-recent-login"
      ) {
        const providerId = current.providerData[0]?.providerId;
        await reauthenticateWithPopup(
          current,
          providerId === "apple.com" ? appleProvider() : googleProvider(),
        );
        await deleteUser(current);
        return;
      }
      throw error;
    }
  }, []);

  const value = useMemo(
    () => ({ user, initialising, signIn, signOut, deleteAccount }),
    [user, initialising, signIn, signOut, deleteAccount],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside <AuthProvider>");
  }
  return context;
}
