"use client";

import { SearchForm } from "@/components/search/search-form";
import { DictionaryPanel } from "@/components/dictionary/dictionary-panel";
import { useAuth } from "@/contexts/auth-context";
import { AccountBenefits } from "@/components/account/account-benefits";

export function SearchClientLayout() {
  const { isAuthenticated } = useAuth();

  return (
    <main className="container mx-auto flex-1 p-4 md:p-8">
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <SearchForm />
        </div>

        {/* Connecté : ses dictionnaires ; sinon, ce que le compte ajoute (dont les dictionnaires personnels) */}
        <div className="lg:col-span-1">
          {isAuthenticated ? <DictionaryPanel /> : <AccountBenefits next="/search" page="search" />}
        </div>
      </div>
    </main>
  );
}
