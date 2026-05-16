import React from "react";
import { motion } from "framer-motion";
import { Home, MapPin, Info, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { UserData } from "@/types";

export type TabId = "home" | "pickup" | "info" | "profile";

interface BottomDockProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  user: UserData;
}

export default function BottomDock({ activeTab, onTabChange, user }: BottomDockProps) {
  console.log("BottomDock rendering, activeTab:", activeTab);
  const allTabs = [
    { id: "home", label: "Beranda", icon: Home },
    { id: "pickup", label: "Penjemputan", icon: MapPin },
    { id: "info", label: "Info", icon: Info },
    { id: "profile", label: "Profil", icon: User },
  ];

  // Filter tabs: Calon Siswa (level 4) cannot access Penjemputan
  const tabs = allTabs.filter(tab => {
    if (tab.id === "pickup" && user.level === 4) return false;
    return true;
  });

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 w-[90%] max-w-md bg-white/80 backdrop-blur-xl border border-white/20 shadow-2xl rounded-3xl p-2 z-50 flex items-center justify-between">
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id as TabId)}
            className={cn(
              "relative flex flex-col items-center justify-center py-2 px-4 rounded-2xl transition-all duration-300",
              isActive ? "text-blue-600" : "text-slate-400 hover:text-slate-600"
            )}
          >
            {isActive && (
              <motion.div
                layoutId="active-pill"
                className="absolute inset-0 bg-blue-50 rounded-2xl -z-10"
                transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
              />
            )}
            <tab.icon size={22} strokeWidth={isActive ? 2.5 : 2} />
            <span className={cn("text-[10px] font-bold mt-1 uppercase tracking-wider", isActive ? "opacity-100" : "opacity-0 h-0 overflow-hidden")}>
              {tab.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
