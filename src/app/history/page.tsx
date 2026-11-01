import { redirect } from "next/navigation";

/** History now lives on the profile page. */
export default function HistoryPage() {
  redirect("/account");
}
