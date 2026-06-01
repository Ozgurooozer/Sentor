import { createContext, useContext } from 'react';

export const ChatWidthContext = createContext<number>(0);

export function useChatWidth(): number {
  return useContext(ChatWidthContext);
}
