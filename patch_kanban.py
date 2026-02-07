#!/usr/bin/env python3
"""
Script to patch app.js for Kanban board rendering
"""

import re

# Read app.js
with open('app.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Define the pattern to find (the old rendering code)
old_pattern = r"    const container = document\.getElementById\('tasks-list'\);.*?container\.innerHTML = headerHtml \+ tasks\.map\(task => this\.renderTaskItem\(task\)\)\.join\(''\);"

# Define the replacement code
new_code = """    // Split tasks by status for Kanban columns
    const pendingTasks = tasks.filter(t => t.status === 'pending');
    const progressTasks = tasks.filter(t => t.status === 'progress');
    const completedTasks = tasks.filter(t => t.status === 'completed');

    // Render in Kanban columns
    const pendingContainer = document.getElementById('tasks-pending');
    const progressContainer = document.getElementById('tasks-progress');
    const completedContainer = document.getElementById('tasks-completed');

    if (pendingContainer) {
      pendingContainer.innerHTML = pendingTasks.length > 0
        ? pendingTasks.map(task => this.renderKanbanCard ? this.renderKanbanCard(task) : this.renderTaskItem(task)).join('')
        : '<div style="padding: 2rem; text-align: center; color: var(--text-muted);">Sin tareas</div>';
    }

    if (progressContainer) {
      progressContainer.innerHTML = progressTasks.length > 0
        ? progressTasks.map(task => this.renderKanbanCard ? this.renderKanbanCard(task) : this.renderTaskItem(task)).join('')
        : '<div style="padding: 2rem; text-align: center; color: var(--text-muted);">Sin tareas</div>';
    }

    if (completedContainer) {
      completedContainer.innerHTML = completedTasks.length > 0
        ? completedTasks.map(task => this.renderKanbanCard ? this.renderKanbanCard(task) : this.renderTaskItem(task)).join('')
        : '<div style="padding: 2rem; text-align: center; color: var(--text-muted);">Sin tareas</div>';
    }

    // Update counters
    const countPending = document.getElementById('count-pending');
    const countProgress = document.getElementById('count-progress');
    const countCompleted = document.getElementById('count-completed');
    
    if (countPending) countPending.textContent = pendingTasks.length;
    if (countProgress) countProgress.textContent = progressTasks.length;
    if (countCompleted) countCompleted.textContent = completedTasks.length;

    // Setup drag-and-drop if function exists
    if (this.setupDragAndDrop) {
      this.setupDragAndDrop();
    }"""

# Perform replacement using regex
content_new = re.sub(old_pattern, new_code, content, flags=re.DOTALL)

# Check if replacement was made
if content == content_new:
    print("ERROR: No match found. Pattern not replaced.")
    print("Trying line-based approach...")
    
    # Alternative: Find and replace by line numbers
    lines = content.split('\n')
    start_idx = None
    for i, line in enumerate(lines):
        if "const container = document.getElementById('tasks-list');" in line:
            start_idx = i
            break
    
    if start_idx:
        # Find the end (closing brace of renderTasks)
        end_idx = None
        brace_count = 0
        for i in range(start_idx, len(lines)):
            if '}' in lines[i]:
                # Found potential end
                end_idx = i + 1
                break
        
        if end_idx:
            # Replace lines start_idx to end_idx
            lines[start_idx:end_idx] = new_code.split('\n') + ['  }']
            content_new = '\n'.join(lines)
            print(f"SUCCESS: Replaced lines {start_idx+1} to {end_idx+1}")
        else:
            print("ERROR: Could not find end of function")
    else:
        print("ERROR: Could not find start pattern")
else:
    print("SUCCESS: Pattern replaced with regex")

# Write back
with open('app.js', 'w', encoding='utf-8') as f:
    f.write(content_new)

print("app.js has been patched for Kanban board!")
