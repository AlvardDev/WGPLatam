"use client";

import { useTransition } from "react";
import { ChevronDown, LogOut } from "lucide-react";
import { signOut } from "@/lib/actions/auth";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { UserAvatar } from "@/components/ui/user-avatar";

export function AdminUserMenu({ fullName, roleLabel }: { fullName: string; roleLabel: string }) {
  const [isPending, startTransition] = useTransition();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-2 rounded-lg py-1 pr-1 pl-1 outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <UserAvatar name={fullName} />
        <span className="hidden text-left leading-tight sm:block">
          <span className="block text-sm font-semibold text-foreground">{fullName}</span>
          <span className="block text-xs text-muted-foreground uppercase">{roleLabel}</span>
        </span>
        <ChevronDown className="hidden size-4 text-muted-foreground sm:block" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex flex-col sm:hidden">
            <span className="font-medium">{fullName}</span>
            <span className="text-xs font-normal text-muted-foreground">{roleLabel}</span>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator className="sm:hidden" />
        <DropdownMenuItem disabled={isPending} onClick={() => startTransition(() => signOut())}>
          <LogOut className="mr-2 size-4" />
          Cerrar sesión
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
