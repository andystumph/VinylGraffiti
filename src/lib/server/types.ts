export type MediaType = 'vinyl' | 'cassette' | 'cd';

export interface InventoryItemRow {
  id: number;
  mediaType: MediaType;
  condition: string | null;
  location: string | null;
  notes: string | null;
  quantity: number;
  createdAt: string;
  updatedAt: string;
  releaseId: number;
  releaseMbid: string | null;
  releaseGroupMbid: string | null;
  albumTitle: string;
  releaseDate: string | null;
  coverThumbUrl: string | null;
  artistName: string;
}

export interface ImportCandidate {
  releaseMbid: string;
  releaseGroupMbid: string | null;
  title: string;
  artist: string;
  releaseDate: string | null;
  hasCoverArt: boolean | null;
  score: number;
}
