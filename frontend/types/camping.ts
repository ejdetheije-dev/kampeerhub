export interface Bounds {
  south: number;
  west: number;
  north: number;
  east: number;
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
  };
}
