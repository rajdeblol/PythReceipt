import { redirect } from "next/navigation"

export default function DisputeSigRedirectPage({ params }: { params: { txSig: string } }) {
  redirect(`/dispute?sig=${encodeURIComponent(params.txSig)}`)
}
