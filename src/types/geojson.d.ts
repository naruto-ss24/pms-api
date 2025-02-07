export type GeoJSONFeature = {
  type: string;
  properties: {
    id: string;
    barangay: string;
    municipality: string;
    district: string;
    province: string;
    region: string;
    country: string;
  };
  geometry: {
    type: "MultiPolygon";
    coordinates: number[][][][];
  };
};

export type GeoJSONFeatureCollection = {
  type: string;
  features: GeoJSONFeature[];
};
