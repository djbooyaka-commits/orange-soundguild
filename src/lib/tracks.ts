import cover1 from "@/assets/cover1.jpg";
import cover2 from "@/assets/cover2.jpg";
import cover3 from "@/assets/cover3.jpg";
import cover4 from "@/assets/cover4.jpg";
import cover5 from "@/assets/cover5.jpg";
import cover6 from "@/assets/cover6.jpg";

export type Track = {
  id: string;
  title: string;
  artist: string;
  cover: string;
  src: string;
  durationLabel: string;
  uploadedAt: string;
  plays: number;
  genre: string;
};

// Public domain / sample mp3s
const S1 = "https://cdn.pixabay.com/audio/2022/10/25/audio_864e7b1cfc.mp3";
const S2 = "https://cdn.pixabay.com/audio/2024/02/22/audio_0a05af9b14.mp3";
const S3 = "https://cdn.pixabay.com/audio/2022/03/15/audio_c8e5e2cdfe.mp3";
const S4 = "https://cdn.pixabay.com/audio/2022/05/27/audio_1808fbf07a.mp3";
const S5 = "https://cdn.pixabay.com/audio/2022/08/02/audio_2dde668d05.mp3";
const S6 = "https://cdn.pixabay.com/audio/2023/06/19/audio_6e5d7d1912.mp3";

export const tracks: Track[] = [
  { id: "1", title: "Ember Drift", artist: "Noctilux", cover: cover1, src: S1, durationLabel: "3:42", uploadedAt: "2h ago", plays: 12480, genre: "Electronic" },
  { id: "2", title: "Charcoal Moon", artist: "Velo Park", cover: cover2, src: S2, durationLabel: "4:18", uploadedAt: "5h ago", plays: 8721, genre: "Indie" },
  { id: "3", title: "Paper Sun", artist: "Mira Holt", cover: cover3, src: S3, durationLabel: "2:56", uploadedAt: "Yesterday", plays: 23104, genre: "Lo-fi" },
  { id: "4", title: "Dune Echoes", artist: "Atlas Bloom", cover: cover4, src: S4, durationLabel: "5:02", uploadedAt: "2d ago", plays: 41203, genre: "Ambient" },
  { id: "5", title: "Brass & Smoke", artist: "Quiet Forum", cover: cover5, src: S5, durationLabel: "3:24", uploadedAt: "3d ago", plays: 5610, genre: "Jazz" },
  { id: "6", title: "Grid Pulse", artist: "Hex Reactor", cover: cover6, src: S6, durationLabel: "6:11", uploadedAt: "4d ago", plays: 17889, genre: "Techno" },
  { id: "7", title: "Slow Orbit", artist: "Noctilux", cover: cover4, src: S4, durationLabel: "4:45", uploadedAt: "5d ago", plays: 9320, genre: "Ambient" },
  { id: "8", title: "Tangerine Static", artist: "Mira Holt", cover: cover1, src: S1, durationLabel: "3:11", uploadedAt: "1w ago", plays: 30021, genre: "Electronic" },
];
