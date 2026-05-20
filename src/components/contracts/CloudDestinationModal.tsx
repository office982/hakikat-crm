"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Cloud, HardDrive, RefreshCcw, AlertCircle } from "lucide-react";
import {
  isSignedIn as isOneDriveSignedIn,
  signIn as oneDriveSignIn,
  switchAccount as oneDriveSwitchAccount,
  getSignedInAccount as getOneDriveAccount,
} from "@/lib/api/onedrive";

export type CloudDestination = "google_drive" | "onedrive";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (destination: CloudDestination) => void;
  title?: string;
  confirmLabel?: string;
}

export function CloudDestinationModal({
  isOpen,
  onClose,
  onConfirm,
  title = "בחירת יעד אחסון",
  confirmLabel = "המשך",
}: Props) {
  const [destination, setDestination] = useState<CloudDestination>("onedrive");
  const [account, setAccount] = useState<{ email: string; name: string } | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Refresh the OneDrive account label whenever the modal opens or
  // destination flips back to onedrive (sign-in / switch updates it).
  useEffect(() => {
    if (!isOpen) return;
    setAccount(getOneDriveAccount());
    setError(null);
  }, [isOpen, destination]);

  const handleSignIn = async () => {
    setWorking(true);
    setError(null);
    try {
      await oneDriveSignIn();
      setAccount(getOneDriveAccount());
    } catch (e) {
      setError(e instanceof Error ? e.message : "התחברות נכשלה");
    } finally {
      setWorking(false);
    }
  };

  const handleSwitch = async () => {
    setWorking(true);
    setError(null);
    try {
      await oneDriveSwitchAccount();
      setAccount(getOneDriveAccount());
    } catch (e) {
      setError(e instanceof Error ? e.message : "החלפת חשבון נכשלה");
    } finally {
      setWorking(false);
    }
  };

  const handleConfirm = () => {
    if (destination === "onedrive" && !isOneDriveSignedIn()) {
      setError("יש להתחבר ל-OneDrive תחילה");
      return;
    }
    onConfirm(destination);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="md">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setDestination("google_drive")}
            className={`flex items-center gap-2 p-3 rounded-lg border text-sm transition-colors ${
              destination === "google_drive"
                ? "border-primary bg-primary/5 text-primary"
                : "border-border hover:bg-gray-50"
            }`}
          >
            <HardDrive className="w-4 h-4" />
            Google Drive
          </button>
          <button
            type="button"
            onClick={() => setDestination("onedrive")}
            className={`flex items-center gap-2 p-3 rounded-lg border text-sm transition-colors ${
              destination === "onedrive"
                ? "border-primary bg-primary/5 text-primary"
                : "border-border hover:bg-gray-50"
            }`}
          >
            <Cloud className="w-4 h-4" />
            OneDrive
          </button>
        </div>

        {destination === "google_drive" && (
          <div className="rounded-lg bg-gray-50 border border-border p-3 text-sm text-muted">
            ייאוחסן בחשבון Google Drive שהוגדר על ידי המנהל.
          </div>
        )}

        {destination === "onedrive" && (
          <div className="rounded-lg bg-gray-50 border border-border p-3 text-sm space-y-2">
            {account ? (
              <>
                <div>
                  <span className="text-muted">חשבון נוכחי: </span>
                  <span className="font-medium" dir="ltr">{account.email}</span>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleSwitch}
                  isLoading={working}
                >
                  <RefreshCcw className="w-4 h-4" />
                  החלף חשבון
                </Button>
              </>
            ) : (
              <>
                <div className="text-muted">לא מחובר ל-OneDrive.</div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleSignIn}
                  isLoading={working}
                >
                  <Cloud className="w-4 h-4" />
                  התחבר ל-OneDrive
                </Button>
              </>
            )}
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 rounded-lg bg-red-50 text-danger p-3 text-sm">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>
            ביטול
          </Button>
          <Button type="button" onClick={handleConfirm} disabled={working}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
