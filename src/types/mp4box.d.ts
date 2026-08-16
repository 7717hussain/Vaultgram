declare module 'mp4box' {
  export interface MP4MediaTrack {
    id: number;
    created: Date;
    modified: Date;
    volume: number;
    track_width: number;
    track_height: number;
    timescale: number;
    duration: number;
    bitrate: number;
    codec: string;
    language: string;
    nb_samples: number;
  }

  export interface MP4VideoTrack extends MP4MediaTrack {
    video: {
      width: number;
      height: number;
    };
  }

  export interface MP4AudioTrack extends MP4MediaTrack {
    audio: {
      sample_rate: number;
      channel_count: number;
      sample_size: number;
    };
  }

  export interface MP4Info {
    duration: number;
    timescale: number;
    isFragmented: boolean;
    isProgressive: boolean;
    hasIOD: boolean;
    brands: string[];
    created: Date;
    modified: Date;
    tracks: MP4MediaTrack[];
    videoTracks: MP4VideoTrack[];
    audioTracks: MP4AudioTrack[];
    mime: string;
  }

  export interface MP4ArrayBuffer extends ArrayBuffer {
    fileStart: number;
  }

  export interface MP4BoxFile {
    onReady?: (info: MP4Info) => void;
    onError?: (err: string | Error) => void;
    onSegment?: (
      id: number,
      user: any,
      buffer: ArrayBuffer,
      sampleNum: number,
      is_last: boolean
    ) => void;
    onSamples?: (id: number, user: any, samples: any[]) => void;

    appendBuffer(data: MP4ArrayBuffer): number;
    flush(): void;
    setSegmentOptions(id: number, user?: any, options?: { nbSamples?: number; rapAlignement?: boolean }): void;
    unsetSegmentOptions(id: number): void;
    initializeSegmentation(): { id: number; user: any; buffer: ArrayBuffer }[];
    start(): void;
    stop(): void;
    seek(time: number, useRAP: boolean): { offset: number; time: number };
    getTrackById(id: number): MP4MediaTrack | undefined;
    releaseUsedBuffers(id: number, sampleNum: number): void;
  }

  export function createFile(keepBuffers?: boolean): MP4BoxFile;

  export class DataStream {
    constructor(buffer?: ArrayBuffer, byteOffset?: number, endianness?: boolean);
    buffer: ArrayBuffer;
    position: number;
  }
}
