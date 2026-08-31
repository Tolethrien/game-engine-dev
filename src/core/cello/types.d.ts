type EffectStep =
  | { type: "gain"; value: number }
  | { type: "delay"; delayTime: number; maxDelayTime?: number }
  | {
      type: "filter";
      filterType: BiquadFilterType; // "lowpass" | "highpass" | "bandpass" | "lowshelf" | "highshelf" | "peaking" | "notch" | "allpass"
      frequency: number;
      detune?: number;
      Q?: number;
      gain?: number; // istotne tylko dla lowshelf/highshelf/peaking
    }
  | { type: "stereoPan"; pan: number } // -1 (lewo) do 1 (prawo)
  | {
      type: "panner3d"; // pełne pozycjonowanie 3D w swiecie!
      positionX: number;
      positionY: number;
      positionZ: number;
      refDistance?: number;
      maxDistance?: number;
      rolloffFactor?: number;
      distanceModel?: DistanceModelType; // "linear" | "inverse" | "exponential"
    }
  | { type: "convolver"; impulseResponseUrl: string; normalize?: boolean } // pogłos, wymaga preloadu bufora
  | {
      type: "compressor";
      threshold?: number; // dB, domyślnie -24
      knee?: number; // domyślnie 30
      ratio?: number; // domyślnie 12
      attack?: number; // sekundy, domyślnie 0.003
      release?: number; // sekundy, domyślnie 0.25
    }
  | {
      type: "waveShaper"; // zniekształcenie/distortion sygnału
      curve: number[]; // krzywa transferu
      oversample?: OverSampleType; // "none" | "2x" | "4x"
    }
  | {
      type: "analyser"; // nie zmienia dźwięku, tylko pozwala odczytać widmo/poziom
      fftSize?: number;
      smoothingTimeConstant?: number;
    };
