export interface Bounds {
  south: number;
  west: number;
  north: number;
  east: number;
  zoom: number;
}

export interface AvailabilityInfo {
  label: string;
  p: number | null;
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
    reservation?: string;
    cozy?: boolean;
  };
  availability?: AvailabilityInfo;
}

export type SizeType = "all" | "small" | "medium" | "large" | "naturist";

export interface Filters {
  dog: boolean;
  wifi: boolean;
  pool: boolean;
  sizeType: SizeType;
  waterMaxKm: number | null; // null = disabled
}

export const DEFAULT_FILTERS: Filters = {
  dog: false,
  wifi: false,
  pool: false,
  sizeType: "all",
  waterMaxKm: null,
};
