# HPA Configurable Scaling Behavior Simulator

A comprehensive web-based simulator for Kubernetes Horizontal Pod Autoscaler (HPA) configurable scaling behavior. This tool helps you understand and visualize how different HPA scaling policies, stabilization windows, and tolerance settings affect your application's scaling behavior.

## 🚀 Features

### Core Functionality
- **Real-time Simulation**: Visualize HPA scaling behavior with interactive charts
- **Configurable Scaling Policies**: Test different Pod and Percent-based scaling policies
- **Stabilization Windows**: Experiment with up/down scaling stabilization periods
- **Tolerance Settings**: Fine-tune scaling sensitivity with tolerance parameters
- **Multiple Scenarios**: Pre-built metric scenarios and custom formulas
- **YAML Generation**: Auto-generate HPA behavior configuration YAML

### Pre-built Templates
- **Default Behavior**: Standard Kubernetes HPA defaults
- **Downscale Stabilization**: 60s stabilization window for scale-down
- **Rate Limiting**: 10% per minute scale-down limits
- **Conservative Scaling**: Min(10% or 5 pods) per minute policies
- **Aggressive Scaling**: 200% or 8 pods per 15s scale-up
- **Custom Configurations**: Various production-ready setups

### Visualization Features
- **Real-time Charts**: Live metric and replica count visualization
- **Decision Logging**: Detailed scaling decision explanations
- **Timeline Control**: Play, pause, step-through simulation
- **Export Capabilities**: Download CSV data and copy YAML configs

## 🎯 Use Cases

- **HPA Tuning**: Optimize scaling behavior for your applications
- **Learning**: Understand HPA mechanics and behavior
- **Testing**: Validate scaling policies before production deployment
- **Documentation**: Generate HPA YAML configurations
- **Troubleshooting**: Debug scaling issues and performance problems

## 🛠️ Getting Started

### Prerequisites
- Modern web browser (Chrome, Firefox, Safari, Edge)
- No installation required - runs entirely in the browser

### Quick Start
1. Open `index.html` in your web browser
2. Select a template from the "Ready-to-use Templates" section
3. Click "Load Template" to apply the configuration
4. Use the simulation controls to start the visualization
5. Observe how the HPA responds to different metric patterns

## 📖 Usage Guide

### Simulation Controls

#### Workload Limits
- **Min Replicas**: Minimum number of pods (default: 1)
- **Max Replicas**: Maximum number of pods (default: 50)
- **Initial Replicas**: Starting number of pods (default: 3)

#### Metrics Configuration
- **Target Metric**: The target value for your metric (default: 100)
- **Scenario**: Pre-built metric patterns:
  - **Gradual rise then fall**: Gradual increase followed by decrease
  - **Noisy around target**: Random fluctuations around target
  - **Sudden burst**: Sharp spike in metrics
  - **Sine wave**: Periodic oscillations
  - **Custom f(t)**: User-defined mathematical function

#### Scheduler Settings
- **HPA Sync Period**: How often HPA evaluates scaling (default: 15s)
- **Time Step**: Simulation time increment (default: 1s)
- **Playback Speed**: Simulation speed multiplier (0.25x to 4x)

### Scaling Behavior Configuration

#### Scale Up Settings
- **Stabilization Window**: Time window to prevent rapid scale-up (default: 0s)
- **Tolerance**: Fractional tolerance for scaling decisions (default: 0.1)
- **Select Policy**: How to choose between multiple policies:
  - **Max**: Use the policy allowing maximum scaling
  - **Min**: Use the policy allowing minimum scaling
  - **Disabled**: Disable scaling in this direction

#### Scale Down Settings
- **Stabilization Window**: Time window to prevent rapid scale-down (default: 300s)
- **Tolerance**: Fractional tolerance for scaling decisions (default: 0.1)
- **Select Policy**: Same options as scale up

### Policy Configuration
Each scaling direction can have multiple policies:

#### Percent Policy
- **Type**: "Percent"
- **Value**: Percentage of current replicas to scale
- **Period Seconds**: Time window for the policy

#### Pods Policy
- **Type**: "Pods"
- **Value**: Absolute number of pods to scale
- **Period Seconds**: Time window for the policy

## 📊 Understanding the Visualization

### Charts
- **Metric Line**: Shows the simulated metric value over time
- **Replicas Line**: Shows the current number of replicas
- **Desired Line**: Shows the calculated desired replicas (before stabilization)
- **Stabilized Line**: Shows the final replicas after applying stabilization

### Decision Log
The log shows detailed information about each scaling decision:
- Timestamp and current state
- Metric value and target comparison
- Tolerance check results
- Policy evaluation and selection
- Final scaling decision

## 🎨 Templates

### Default Behavior
Matches Kubernetes HPA controller defaults:
- Scale up: 0s stabilization, 100% or 4 pods per 15s (Max policy)
- Scale down: 300s stabilization, 100% per 15s (Max policy)

### Downscale Stabilization Window = 60s
Reduces scale-down fluctuations with a 60-second stabilization window.

### Limit Scale Down: 10% per Minute
Enforces a maximum scale-down rate of 10% of current replicas per minute.

### Limit Scale Down: Min(10% or 5 pods) per Minute
Uses Min policy to remove the smaller of 10% or 5 pods per minute.

### Aggressive Scale Up: 200% or 8 pods per 15s
Allows rapid scale-up for handling sudden traffic spikes.

## 🔧 Technical Details

### Architecture
- **Frontend**: Pure HTML/CSS/JavaScript (no frameworks)
- **Charts**: Custom SVG-based visualization
- **Simulation**: Real-time HPA algorithm implementation
- **YAML Generation**: Client-side YAML formatting

### HPA Algorithm Implementation
The simulator implements the complete HPA scaling algorithm:
1. **Metric Evaluation**: Compare current metric to target
2. **Tolerance Check**: Determine if scaling is needed
3. **Policy Evaluation**: Calculate scaling based on configured policies
4. **Stabilization**: Apply stabilization window logic
5. **Bounds Check**: Ensure replicas stay within min/max limits

### Key Concepts

#### Stabilization Window
Prevents rapid scaling fluctuations by maintaining the highest (for scale-up) or lowest (for scale-down) desired replica count within the window period.

#### Tolerance
Defines how much the metric can deviate from the target before scaling is triggered. A tolerance of 0.1 means scaling occurs when the metric is outside ±10% of the target.

#### Select Policy
Determines how to choose between multiple scaling policies:
- **Max**: Use the policy that allows the most scaling
- **Min**: Use the policy that allows the least scaling
- **Disabled**: Prevent scaling in this direction

## 📁 Project Structure

```
hpa_visualizser/
├── index.html          # Main application interface
├── simulator.js        # Core HPA simulation logic
├── examples.js         # Pre-built template configurations
├── styles.css          # Application styling
├── .gitignore          # Git ignore rules
└── README.md           # This file
```

## 🤝 Contributing

Contributions are welcome! Areas for improvement:
- Additional metric scenarios
- More pre-built templates
- Enhanced visualization features
- Performance optimizations
- Documentation improvements

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🔗 References

- [Kubernetes HPA Configurable Scaling Behavior](https://kubernetes.io/docs/tasks/run-application/horizontal-pod-autoscale/#configurable-scaling-behavior)
- [Horizontal Pod Autoscaler](https://kubernetes.io/docs/tasks/run-application/horizontal-pod-autoscale/)

## 🆘 Support

If you encounter issues or have questions:
1. Check the browser console for error messages
2. Verify your browser supports modern JavaScript features
3. Try refreshing the page to reset the simulation state

---

**Note**: This simulator is for educational and testing purposes. Always validate HPA configurations in a proper Kubernetes environment before production use.
