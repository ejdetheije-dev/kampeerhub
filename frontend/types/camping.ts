export interface Bounds {
  south: number;
  west: number;
  north: number;
  east: number;
  zoom: number;
}

export interface Camping {
  id: string;
  name: string;
  lat: number;
  lon: number;
  tags: {
    dog?: boolean;
    wifi?: boolean;
    pool?: boolean;
    electricity?: boolean;
    nudism?: boolean;
    capacity?: number;
    fee?: string;
    charge?: string;
    website?: string;
  };
}

export type SizeType = "all" | "small" | "medium" | "large" | "naturist";

export interface Filters {
  dog: boolean;
  wifi: boolean;
  pool: boolean;
  electricity: boolean;
  sizeType: SizeType;
  priceMax: number;       // 80 = no limit
  waterMaxKm: number | null; // null = disabled
}

export const DEFAULT_FILTERS: Filters = {
  dog: false,
  wifi: false,
  pool: false,
  electricity: false,
  sizeType: "all",
  priceMax: 80,
  waterMaxKm: null,
};
