import { redirect } from "next/navigation";

export default function DigitalGoodsPage() {
  redirect("/products?type=virtual");
}
