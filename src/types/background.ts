export type BackgroundRequest =
  | {
      type: 'semantic-memory:query';
      prompt: string;
    }
  | {
      type: 'semantic-memory:hydrate';
    };

export type BackgroundResponse =
  | {
      type: 'semantic-memory:query:success';
      data: {
        text: string;
        tokensEstimated?: number;
        contextPages: Array<{ id: string; title: string }>;
      };
    }
  | {
      type: 'semantic-memory:query:error';
      error: string;
    }
  | {
      type: 'semantic-memory:hydrate:success';
    };
