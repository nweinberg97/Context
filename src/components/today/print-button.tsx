"use client";

import { IconPrint } from "../icons";
import { Button } from "../ui";

export function PrintButton() {
  return (
    <Button variant="secondary" onClick={() => window.print()}>
      <IconPrint size={18} /> Print this page
    </Button>
  );
}
