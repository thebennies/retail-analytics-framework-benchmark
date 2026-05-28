export async function load({ params }: { params: { id: string } }) {
  return { runId: Number(params.id) };
}
