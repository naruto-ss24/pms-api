export type Candidate = {
  name: string;
  votes: number;
};

export type AreaData = {
  id: string;
  properties?: { label: string; value: string }[];
  totalVoters: number;
  candidates: Candidate[];
};
