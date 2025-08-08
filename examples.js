// Templates derived from Kubernetes HPA configurable scaling behavior docs
// Ref: https://kubernetes.io/docs/tasks/run-application/horizontal-pod-autoscale/#configurable-scaling-behavior

/* global window */

window.HPA_EXAMPLES = [
    {
        id: "default-behavior",
        name: "Default behavior (cluster defaults)",
        description:
            "Matches the HPA controller defaults: scaleDown has 300s stabilization, 100%/15s; scaleUp has 0s stabilization, 100% or 4 pods per 15s with Max policy.",
        params: {
            minReplicas: 1,
            maxReplicas: 50,
            initialReplicas: 3,
            targetValue: 100,
            syncPeriod: 15,
            up: {
                stabilizationWindowSeconds: 0,
                tolerance: 0.1,
                selectPolicy: "Max",
                policies: [
                    { type: "Percent", value: 100, periodSeconds: 15 },
                    { type: "Pods", value: 4, periodSeconds: 15 },
                ],
            },
            down: {
                stabilizationWindowSeconds: 300,
                tolerance: 0.1,
                selectPolicy: "Max",
                policies: [
                    { type: "Percent", value: 100, periodSeconds: 15 },
                ],
            },
        },
    },
    {
        id: "downscale-window-60",
        name: "Downscale stabilization window = 60s",
        description: "Slows scale-down fluctuations by using a 60s stabilization window.",
        params: {
            minReplicas: 1,
            maxReplicas: 50,
            initialReplicas: 8,
            targetValue: 100,
            syncPeriod: 15,
            up: {
                stabilizationWindowSeconds: 0,
                tolerance: 0.1,
                selectPolicy: "Max",
                policies: [
                    { type: "Percent", value: 100, periodSeconds: 15 },
                    { type: "Pods", value: 4, periodSeconds: 15 },
                ],
            },
            down: {
                stabilizationWindowSeconds: 60,
                tolerance: 0.1,
                selectPolicy: "Max",
                policies: [
                    { type: "Percent", value: 100, periodSeconds: 15 },
                ],
            },
        },
    },
    {
        id: "limit-scale-down-10p-per-min",
        name: "Limit scale down: 10% per minute",
        description:
            "Enforces scale down rate of at most 10% of current replicas each 60 seconds.",
        params: {
            minReplicas: 1,
            maxReplicas: 100,
            initialReplicas: 40,
            targetValue: 100,
            syncPeriod: 15,
            up: {
                stabilizationWindowSeconds: 0,
                tolerance: 0.1,
                selectPolicy: "Max",
                policies: [
                    { type: "Percent", value: 100, periodSeconds: 15 },
                    { type: "Pods", value: 4, periodSeconds: 15 },
                ],
            },
            down: {
                stabilizationWindowSeconds: 300,
                tolerance: 0.1,
                selectPolicy: "Max",
                policies: [
                    { type: "Percent", value: 10, periodSeconds: 60 },
                ],
            },
        },
    },
    {
        id: "limit-scale-down-min-10p-or-5pods",
        name: "Limit scale down: Min(10% or 5 pods) per minute",
        description:
            "Two policies with selectPolicy = Min ensure you remove the smaller of 10% or 5 pods per minute.",
        params: {
            minReplicas: 1,
            maxReplicas: 100,
            initialReplicas: 80,
            targetValue: 100,
            syncPeriod: 15,
            up: {
                stabilizationWindowSeconds: 0,
                tolerance: 0.1,
                selectPolicy: "Max",
                policies: [
                    { type: "Percent", value: 100, periodSeconds: 15 },
                    { type: "Pods", value: 4, periodSeconds: 15 },
                ],
            },
            down: {
                stabilizationWindowSeconds: 300,
                tolerance: 0.1,
                selectPolicy: "Min",
                policies: [
                    { type: "Percent", value: 10, periodSeconds: 60 },
                    { type: "Pods", value: 5, periodSeconds: 60 },
                ],
            },
        },
    },
    {
        id: "disable-scale-down",
        name: "Disable scale down",
        description: "Downscaling is disabled using selectPolicy = Disabled.",
        params: {
            minReplicas: 1,
            maxReplicas: 50,
            initialReplicas: 12,
            targetValue: 100,
            syncPeriod: 15,
            up: {
                stabilizationWindowSeconds: 0,
                tolerance: 0.1,
                selectPolicy: "Max",
                policies: [
                    { type: "Percent", value: 100, periodSeconds: 15 },
                    { type: "Pods", value: 4, periodSeconds: 15 },
                ],
            },
            down: {
                stabilizationWindowSeconds: 300,
                tolerance: 0.1,
                selectPolicy: "Disabled",
                policies: [],
            },
        },
    },
    {
        id: "add-scale-up-tolerance-5p",
        name: "Scale up tolerance = 5%",
        description:
            "Demonstrates tolerance gating for scale up (alpha in v1.33): will not scale up until metric exceeds target by 5%.",
        params: {
            minReplicas: 1,
            maxReplicas: 50,
            initialReplicas: 3,
            targetValue: 100,
            syncPeriod: 15,
            up: {
                stabilizationWindowSeconds: 0,
                tolerance: 0.05,
                selectPolicy: "Max",
                policies: [
                    { type: "Percent", value: 100, periodSeconds: 15 },
                    { type: "Pods", value: 4, periodSeconds: 15 },
                ],
            },
            down: {
                stabilizationWindowSeconds: 300,
                tolerance: 0.1,
                selectPolicy: "Max",
                policies: [
                    { type: "Percent", value: 100, periodSeconds: 15 },
                ],
            },
        },
    },
];


