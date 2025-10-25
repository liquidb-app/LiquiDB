"use client"

import React, { useEffect } from "react"
import { wasTourRequested, setTourRequested, wasTourSkipped } from "@/lib/preferences"

// Comprehensive tour using Onborda library
export function MaybeStartTour() {
  useEffect(() => {
    if (!wasTourRequested() || wasTourSkipped()) return
    async function start() {
      try {
        const mod = await import("onborda").catch(() => null as any)
        if (!mod) return
        const { createTour } = mod as any
        
        const tour = createTour({ 
          id: "liquiDB-complete-tour",
          options: {
            allowKeyboardNavigation: true,
            allowSkip: true,
            allowClose: true,
            showProgress: true,
            showStepNumbers: true,
            overlay: {
              color: "rgba(0, 0, 0, 0.8)",
              blur: 3
            }
          }
        })
        
        tour
          // Step 1: Welcome and main interface
          .step({
            element: "body",
            title: "Welcome to LiquiDB! 🎉",
            description: "Let's take a quick tour of your new database management interface. This tour will show you all the key features and how to use them effectively.",
            placement: "center",
            showSkip: false
          })
          
          // Step 2: Add Database Button
          .step({
            element: "#btn-add-database",
            title: "Create Your First Database",
            description: "Click here to add a new database container. You can choose from PostgreSQL, MySQL, MongoDB, Redis, and many other database types.",
            placement: "bottom",
            highlight: true
          })
          
          // Step 3: Database List/Grid
          .step({
            element: "[data-testid='database-grid'], .database-grid, #database-list",
            title: "Your Database Collection",
            description: "This is where all your database containers will appear. Each card shows the database status, connection details, and quick actions.",
            placement: "top",
            highlight: true
          })
          
          // Step 4: Settings Button
          .step({
            element: "#btn-open-settings",
            title: "Application Settings",
            description: "Access your app preferences, theme settings, notification preferences, and helper service configuration.",
            placement: "left",
            highlight: true
          })
          
          // Step 5: Profile Menu
          .step({
            element: "[data-testid='profile-menu'], .profile-menu, #profile-trigger",
            title: "Your Profile",
            description: "Manage your user profile, avatar, and account settings. This is also where you can access additional user preferences.",
            placement: "bottom",
            highlight: true
          })
          
          // Step 6: Database Actions (if any databases exist)
          .step({
            element: "[data-testid='database-actions'], .database-actions",
            title: "Database Management",
            description: "Once you have databases, you'll see action buttons for starting, stopping, configuring, and managing each database container.",
            placement: "top",
            highlight: true,
            condition: () => document.querySelector("[data-testid='database-actions']") !== null
          })
          
          // Step 7: Helper Service Status
          .step({
            element: "[data-testid='helper-status'], .helper-status",
            title: "Helper Service",
            description: "The helper service provides advanced features like port monitoring and system integration. You can install and manage it from the settings.",
            placement: "top",
            highlight: true,
            condition: () => document.querySelector("[data-testid='helper-status']") !== null
          })
          
          // Step 8: Navigation and Tabs
          .step({
            element: "[data-testid='main-tabs'], .main-tabs, [role='tablist']",
            title: "Navigation",
            description: "Use these tabs to switch between different views and manage your databases, settings, and other features.",
            placement: "bottom",
            highlight: true,
            condition: () => document.querySelector("[data-testid='main-tabs']") !== null
          })
          
          // Step 9: Quick Actions
          .step({
            element: "[data-testid='quick-actions'], .quick-actions",
            title: "Quick Actions",
            description: "Access frequently used features like creating databases, managing ports, and system monitoring from these quick action buttons.",
            placement: "top",
            highlight: true,
            condition: () => document.querySelector("[data-testid='quick-actions']") !== null
          })
          
          // Step 10: Final step
          .step({
            element: "body",
            title: "You're All Set! 🚀",
            description: "That's it! You now know how to use LiquiDB. Start by creating your first database, explore the settings, and enjoy managing your databases with ease. Happy coding!",
            placement: "center",
            showSkip: false
          })
          
        tour.start()
      } catch (error) {
        console.error("Failed to start tour:", error)
      } finally {
        setTourRequested(false)
      }
    }
    start()
  }, [])
  return null
}




