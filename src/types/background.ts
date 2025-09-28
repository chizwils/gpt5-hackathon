export type BackgroundRequest =
  | {
      type: 'semantic-memory:query';
      prompt: string;
      threadId: string;
      assistantMessageId: string;
    }
  | {
      type: 'semantic-memory:hydrate';
    };

export type BackgroundResponse =
  | {
      type: 'semantic-memory:query:accepted';
    }
  | {
      type: 'semantic-memory:query:error';
      error: string;
    }
  | {
      type: 'semantic-memory:hydrate:success';
    };

export type BackgroundPush =
  | {
      type: 'semantic-memory:query:chunk';
      threadId: string;
      assistantMessageId: string;
      delta: string;
    }
  | {
      type: 'semantic-memory:query:done';
      threadId: string;
      assistantMessageId: string;
      text: string;
      tokensEstimated?: number;
      contextPages: Array<{ id: string; title: string }>;
      contextItems?: Array<{ id: string; title: string; snippet: string }>;
    }
  | {
      type: 'semantic-memory:query:error';
      threadId: string;
      assistantMessageId: string;
      error: string;
    };
