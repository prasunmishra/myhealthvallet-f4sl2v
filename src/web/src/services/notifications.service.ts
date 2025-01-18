/**
 * @fileoverview Notification Service Implementation
 * @version 1.0.0
 * 
 * Comprehensive service for managing notifications in the PHRSAT web application:
 * - Real-time WebSocket notifications
 * - Secure notification management
 * - Rich media support
 * - Priority-based handling
 * - Offline queue support
 */

import { io, Socket } from 'socket.io-client'; // version: ^4.7.0
import { BehaviorSubject, Observable, Subject, timer } from 'rxjs'; // version: ^7.8.0
import { retryWhen, delay, take, tap } from 'rxjs/operators'; // version: ^7.8.0

import { ApiService } from './api.service';
import { API_CONFIG } from '../config/api.config';
import { 
  Notification, 
  NotificationFilter, 
  NotificationList, 
  NotificationType,
  NotificationPriority 
} from '../types/notifications.types';

@Injectable({ providedIn: 'root' })
export class NotificationService {
  private socket: Socket;
  private readonly baseUrl: string;
  private readonly wsUrl: string;
  private notificationSubject: BehaviorSubject<Notification[]>;
  private reconnectAttempts: number = 0;
  private readonly MAX_RECONNECT_ATTEMPTS = 5;
  private readonly RECONNECT_DELAY = 2000;
  private offlineQueue: Notification[] = [];

  constructor(
    private apiService: ApiService,
    private authService: AuthService
  ) {
    this.baseUrl = `${API_CONFIG.BASE_URL}/api/${API_CONFIG.API_VERSION}/notifications`;
    this.wsUrl = API_CONFIG.getEnvironmentConfig().wsUrl;
    this.notificationSubject = new BehaviorSubject<Notification[]>([]);
    this.initializeWebSocket();
  }

  /**
   * Initialize WebSocket connection with authentication and reconnection handling
   */
  private initializeWebSocket(): void {
    this.socket = io(this.wsUrl, {
      auth: {
        token: this.authService.getAuthToken()
      },
      reconnection: true,
      reconnectionAttempts: this.MAX_RECONNECT_ATTEMPTS,
      reconnectionDelay: this.RECONNECT_DELAY,
      transports: ['websocket']
    });

    this.setupSocketListeners();
  }

  /**
   * Set up WebSocket event listeners
   */
  private setupSocketListeners(): void {
    this.socket.on('connect', () => {
      this.reconnectAttempts = 0;
      this.processOfflineQueue();
    });

    this.socket.on('notification', (notification: Notification) => {
      this.handleNewNotification(notification);
    });

    this.socket.on('disconnect', () => {
      if (this.reconnectAttempts < this.MAX_RECONNECT_ATTEMPTS) {
        this.reconnectAttempts++;
        timer(this.RECONNECT_DELAY).subscribe(() => {
          this.initializeWebSocket();
        });
      }
    });

    this.socket.on('error', (error) => {
      console.error('WebSocket error:', error);
      this.handleConnectionError(error);
    });
  }

  /**
   * Get paginated notifications with filtering
   */
  public async getNotifications(
    page: number = 1,
    size: number = 20,
    filter?: NotificationFilter
  ): Promise<NotificationList> {
    const params = new URLSearchParams({
      page: page.toString(),
      size: size.toString(),
      ...(filter && { filter: JSON.stringify(filter) })
    });

    const response = await this.apiService.get<NotificationList>(
      `${this.baseUrl}?${params.toString()}`
    );
    
    this.notificationSubject.next(response.data.items);
    return response.data;
  }

  /**
   * Mark notification as read
   */
  public async markAsRead(notificationId: string): Promise<void> {
    await this.apiService.put(`${this.baseUrl}/${notificationId}/read`, {});
    this.updateNotificationStatus(notificationId, true);
  }

  /**
   * Mark all notifications as read
   */
  public async markAllAsRead(): Promise<void> {
    await this.apiService.put(`${this.baseUrl}/read-all`, {});
    const currentNotifications = this.notificationSubject.value;
    const updatedNotifications = currentNotifications.map(notification => ({
      ...notification,
      readAt: new Date()
    }));
    this.notificationSubject.next(updatedNotifications);
  }

  /**
   * Delete a notification
   */
  public async deleteNotification(notificationId: string): Promise<void> {
    await this.apiService.delete(`${this.baseUrl}/${notificationId}`);
    const currentNotifications = this.notificationSubject.value;
    const updatedNotifications = currentNotifications.filter(
      notification => notification.id !== notificationId
    );
    this.notificationSubject.next(updatedNotifications);
  }

  /**
   * Get notification stream as Observable
   */
  public getNotificationStream(): Observable<Notification[]> {
    return this.notificationSubject.asObservable().pipe(
      retryWhen(errors =>
        errors.pipe(
          delay(this.RECONNECT_DELAY),
          take(this.MAX_RECONNECT_ATTEMPTS),
          tap(retryCount => {
            console.warn(`Retry attempt ${retryCount + 1}`);
          })
        )
      )
    );
  }

  /**
   * Handle notification expiration
   */
  public async handleNotificationExpiration(notification: Notification): Promise<void> {
    if (notification.expiresAt && new Date(notification.expiresAt) <= new Date()) {
      await this.archiveNotification(notification.id);
    }
  }

  /**
   * Archive a notification
   */
  private async archiveNotification(notificationId: string): Promise<void> {
    await this.apiService.put(`${this.baseUrl}/${notificationId}/archive`, {});
    const currentNotifications = this.notificationSubject.value;
    const updatedNotifications = currentNotifications.filter(
      notification => notification.id !== notificationId
    );
    this.notificationSubject.next(updatedNotifications);
  }

  /**
   * Handle new notification arrival
   */
  private handleNewNotification(notification: Notification): void {
    if (!navigator.onLine) {
      this.offlineQueue.push(notification);
      return;
    }

    const currentNotifications = this.notificationSubject.value;
    this.notificationSubject.next([notification, ...currentNotifications]);

    if (notification.priority === NotificationPriority.URGENT) {
      this.showUrgentNotification(notification);
    }
  }

  /**
   * Process queued notifications when coming back online
   */
  private async processOfflineQueue(): Promise<void> {
    if (this.offlineQueue.length === 0) return;

    const currentNotifications = this.notificationSubject.value;
    this.notificationSubject.next([...this.offlineQueue, ...currentNotifications]);
    this.offlineQueue = [];
  }

  /**
   * Update notification status in the subject
   */
  private updateNotificationStatus(notificationId: string, read: boolean): void {
    const currentNotifications = this.notificationSubject.value;
    const updatedNotifications = currentNotifications.map(notification =>
      notification.id === notificationId
        ? { ...notification, readAt: read ? new Date() : null }
        : notification
    );
    this.notificationSubject.next(updatedNotifications);
  }

  /**
   * Handle urgent notifications
   */
  private showUrgentNotification(notification: Notification): void {
    if (Notification.permission === 'granted') {
      new Notification(notification.content.title, {
        body: notification.content.message,
        icon: notification.content.imageUrl || undefined,
        tag: notification.id
      });
    }
  }

  /**
   * Handle WebSocket connection errors
   */
  private handleConnectionError(error: any): void {
    console.error('WebSocket connection error:', error);
    if (this.reconnectAttempts < this.MAX_RECONNECT_ATTEMPTS) {
      this.reconnectAttempts++;
      timer(this.RECONNECT_DELAY * this.reconnectAttempts).subscribe(() => {
        this.initializeWebSocket();
      });
    }
  }
}