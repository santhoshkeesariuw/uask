import { Component } from '@angular/core';
import { FeedbackDashboardComponent } from './feedback-dashboard/feedback-dashboard.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [FeedbackDashboardComponent],
  template: '<app-feedback-dashboard />',
})
export class AppComponent {}
