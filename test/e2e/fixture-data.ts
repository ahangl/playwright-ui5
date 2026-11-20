import type { APIRequestContext } from "@playwright/test";

/**
 * Deletes the draft of an author, if there is one (left by an earlier test or a retry): the object
 * page doesn't show Edit for an author that already has a draft.
 */
export async function discardAuthorDraft(request: APIRequestContext, id: string): Promise<void> {
  const response = await request.delete(`/odata/v4/catalog/Authors(ID=${id},IsActiveEntity=false)`);
  if (!response.ok() && response.status() !== 404) {
    throw new Error(`discarding the draft of author ${id} failed: ${response.status()} ${await response.text()}`);
  }
}
