import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

/**
 * Root component of the Typs application.
 * Delegates all layout and routing to child routes.
 */
@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {}
