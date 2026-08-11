"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangleIcon,
  CheckIcon,
  Loader2Icon,
  LogOutIcon,
  Trash2Icon,
} from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/lib/auth-context";
import { useProfile, useUpdateProfile } from "@/lib/hooks/use-profile";
import { useSyncStatus } from "@/lib/hooks/use-sync-status";
import { KG_PER_LB, LB_PER_KG } from "@/lib/units";
import type { Gender, UnitSystem } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";

const GENDER_OPTIONS: { value: Gender; label: string }[] = [
  { value: "female", label: "Female" },
  { value: "male", label: "Male" },
  { value: "non_binary", label: "Non-binary" },
];

export default function ProfilePage() {
  const { user, signOut, deleteAccount } = useAuth();
  const { data: profile, isPending } = useProfile();
  const { online } = useSyncStatus();
  const updateProfile = useUpdateProfile();
  const router = useRouter();

  const [displayName, setDisplayName] = useState("");
  const [nameDirty, setNameDirty] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (profile && !nameDirty) setDisplayName(profile.displayName);
  }, [profile, nameDirty]);

  async function saveName() {
    const trimmed = displayName.trim();
    if (trimmed.length === 0) {
      toast.error("Your name can't be empty");
      setDisplayName(profile?.displayName ?? "");
      setNameDirty(false);
      return;
    }
    if (trimmed === profile?.displayName) {
      setNameDirty(false);
      return;
    }

    try {
      await updateProfile.mutateAsync({ displayName: trimmed });
      setNameDirty(false);
      toast.success("Name updated");
    } catch {
      toast.error("Could not update your name");
    }
  }

  async function setUnitSystem(unitSystem: UnitSystem) {
    try {
      await updateProfile.mutateAsync({ unitSystem });
      toast.success(
        unitSystem === "metric" ? "Showing kg and km" : "Showing lbs and miles",
      );
    } catch {
      toast.error("Could not change units");
    }
  }

  async function setGender(gender: Gender) {
    try {
      await updateProfile.mutateAsync({ gender });
    } catch {
      toast.error("Could not update your profile");
    }
  }

  async function handleSignOut() {
    try {
      await signOut();
      router.replace("/login");
    } catch {
      toast.error("Could not sign out");
    }
  }

  async function handleDeleteAccount() {
    setDeleting(true);
    try {
      await deleteAccount();
      toast.success("Your account and all training data were deleted");
      router.replace("/login");
    } catch (error) {
      setDeleting(false);
      // deleteAllUserData refuses outright when offline, and says why.
      const offline = !online;
      toast.error(
        offline ? "Deleting your account needs a connection" : "Could not delete your account",
        {
          description: offline
            ? "Try again once you are back online."
            : error instanceof Error && error.message
              ? error.message
              : "Sign out, sign back in, and try once more.",
        },
      );
    }
  }

  if (isPending || !profile) {
    return (
      <div className="space-y-4 pt-5">
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-52 w-full rounded-xl" />
        <Skeleton className="h-32 w-full rounded-xl" />
      </div>
    );
  }

  const isImperial = profile.unitSystem === "imperial";
  const initial = profile.displayName.trim().charAt(0).toUpperCase() || "?";

  return (
    <div className="space-y-5 pb-4">
      {/* --- Header --- */}
      <section className="flex items-center gap-4 pt-6">
        <div className="from-primary to-accent text-primary-foreground font-display grid size-16 shrink-0 place-items-center rounded-2xl bg-gradient-to-br text-2xl font-extrabold">
          {initial}
        </div>
        <div className="min-w-0">
          <h1 className="font-display truncate text-2xl leading-tight font-extrabold">
            {profile.displayName}
          </h1>
          <p className="text-muted-foreground truncate text-sm">
            {user?.email ?? profile.email}
          </p>
        </div>
      </section>

      {/* --- Settings --- */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm tracking-widest uppercase">
            Settings
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="displayName">Display name</Label>
            <div className="flex gap-2">
              <Input
                id="displayName"
                value={displayName}
                maxLength={60}
                onChange={(event) => {
                  setNameDirty(true);
                  setDisplayName(event.target.value);
                }}
                onBlur={saveName}
              />
              {nameDirty && (
                <Button
                  size="icon"
                  aria-label="Save name"
                  onClick={saveName}
                  disabled={updateProfile.isPending}
                >
                  {updateProfile.isPending ? (
                    <Loader2Icon className="animate-spin" />
                  ) : (
                    <CheckIcon />
                  )}
                </Button>
              )}
            </div>
          </div>

          {/* Units --------------------------------------------------------- */}
          <div className="space-y-2">
            <Label htmlFor="units">Units</Label>
            <label
              htmlFor="units"
              className="border-border bg-input/40 flex min-h-14 cursor-pointer items-center justify-between gap-4 rounded-xl border px-4 py-3"
            >
              <span className="min-w-0">
                <span className="block font-semibold">
                  {isImperial ? "Imperial" : "Metric"}
                </span>
                <span className="text-muted-foreground block text-xs">
                  {isImperial ? "lbs · miles" : "kg · km"}
                </span>
              </span>
              <Switch
                id="units"
                checked={isImperial}
                onCheckedChange={(checked) =>
                  setUnitSystem(checked ? "imperial" : "metric")
                }
              />
            </label>
            <p className="text-muted-foreground/70 text-xs leading-relaxed">
              Loads are stored in kilograms and converted on display
              {" "}({LB_PER_KG.toFixed(5)} lbs per kg, {KG_PER_LB.toFixed(5)} kg
              per lb), so switching re-labels your whole history without changing
              a single record.
            </p>
          </div>

          {/* Gender -------------------------------------------------------- */}
          <div className="space-y-2">
            <Label htmlFor="gender">Gender</Label>
            <Select
              value={profile.gender}
              onValueChange={(value) => setGender(value as Gender)}
            >
              <SelectTrigger id="gender">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {GENDER_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* --- Account --- */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm tracking-widest uppercase">
            Account
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Button
            variant="secondary"
            className="w-full justify-start"
            onClick={handleSignOut}
          >
            <LogOutIcon />
            Sign out
          </Button>

          <Button
            variant="ghost"
            className="text-destructive hover:bg-destructive/10 hover:text-destructive w-full justify-start"
            onClick={() => {
              setDeleteConfirm("");
              setDeleteOpen(true);
            }}
          >
            <Trash2Icon />
            Delete account
          </Button>
        </CardContent>
      </Card>

      {/* Irreversible, so it asks the user to type the word rather than tap once. */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangleIcon className="text-destructive size-5" />
              Delete your account?
            </DialogTitle>
            <DialogDescription>
              This permanently deletes your profile, every workout you have
              logged and every personal record. It cannot be undone.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="deleteConfirm">Type DELETE to confirm</Label>
            <Input
              id="deleteConfirm"
              value={deleteConfirm}
              onChange={(event) => setDeleteConfirm(event.target.value)}
              placeholder="DELETE"
              autoComplete="off"
              autoCapitalize="characters"
            />
          </div>

          <DialogFooter>
            <DialogClose asChild>
              <Button variant="secondary" disabled={deleting}>
                Cancel
              </Button>
            </DialogClose>
            <Button
              variant="destructive"
              disabled={deleteConfirm.trim().toUpperCase() !== "DELETE" || deleting}
              onClick={handleDeleteAccount}
            >
              {deleting ? <Loader2Icon className="animate-spin" /> : <Trash2Icon />}
              Delete everything
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
