import * as vscode from 'vscode';
import type { DashboardSession, SessionSurface } from '../../app/dashboardSession';
import type { SessionCommand, WebviewCommand } from '../../shared/messages';

/**
 * One router per webview surface: navigation commands are handled here, everything else is a
 * session command (GitHub, Jira, attention, AI).
 */
export function routeWebviewCommand(
  message: WebviewCommand,
  session: DashboardSession,
  surface: SessionSurface,
): void {
  if (!message || typeof message.command !== 'string') return;
  switch (message.command) {
    case 'nav.openDashboard':
      void vscode.commands.executeCommand('devMateKit.openDashboard');
      return;
    case 'nav.openSetup':
      void vscode.commands.executeCommand('devMateKit.openSetup', message.step);
      return;
    case 'nav.openTool':
      void vscode.commands.executeCommand('devMateKit.openTool', message.toolId);
      return;
    case 'nav.openSettings':
      void vscode.commands.executeCommand('workbench.action.openSettings', '@ext:khainx-developer.devmate-kit');
      return;
    case 'session.ready':
      session.surfaceReady(surface);
      return;
    default:
      void session.handleCommand(message as SessionCommand).catch((error: unknown) => {
        const detail = error instanceof Error ? error.message : String(error);
        session.log(`[webview] ${message.command} failed: ${detail}`);
      });
  }
}
