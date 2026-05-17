"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { getUser, type StoredUser } from "@/lib/auth";

type UserContextType = {
  user: StoredUser | null;
  tier: "free" | "pro";
  isFree: boolean;
};

const UserContext = createContext<UserContextType>({
  user: null,
  tier: "free",
  isFree: true,
});

export function UserProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<StoredUser | null>(null);
  useEffect(() => {
    setUser(getUser());
  }, []);
  const tier = user?.tier ?? "free";
  return (
    <UserContext.Provider value={{ user, tier, isFree: tier === "free" }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  return useContext(UserContext);
}
