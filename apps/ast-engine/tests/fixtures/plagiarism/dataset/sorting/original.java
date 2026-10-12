package edu.fpt.dsa;

import java.util.Arrays;
import java.util.Scanner;

/**
 * Bài mẫu gốc: các thuật toán sắp xếp và tìm kiếm cơ bản.
 */
public class SortingToolkit {

    // Sắp xếp nổi bọt
    public static void bubbleSort(int[] arr) {
        int n = arr.length;
        for (int i = 0; i < n - 1; i++) {
            boolean swapped = false;
            for (int j = 0; j < n - i - 1; j++) {
                if (arr[j] > arr[j + 1]) {
                    int temp = arr[j];
                    arr[j] = arr[j + 1];
                    arr[j + 1] = temp;
                    swapped = true;
                }
            }
            if (!swapped) {
                break;
            }
        }
    }

    // Tìm kiếm nhị phân
    public static int binarySearch(int[] arr, int target) {
        int left = 0;
        int right = arr.length - 1;
        while (left <= right) {
            int mid = left + (right - left) / 2;
            if (arr[mid] == target) {
                return mid;
            } else if (arr[mid] < target) {
                left = mid + 1;
            } else {
                right = mid - 1;
            }
        }
        return -1;
    }

    // Sắp xếp chèn
    public static void insertionSort(int[] arr) {
        for (int i = 1; i < arr.length; i++) {
            int key = arr[i];
            int j = i - 1;
            while (j >= 0 && arr[j] > key) {
                arr[j + 1] = arr[j];
                j--;
            }
            arr[j + 1] = key;
        }
    }

    // Ước chung lớn nhất
    public static int gcd(int a, int b) {
        while (b != 0) {
            int r = a % b;
            a = b;
            b = r;
        }
        return a;
    }

    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        int size = sc.nextInt();
        int[] data = new int[size];
        for (int i = 0; i < size; i++) {
            data[i] = sc.nextInt();
        }
        bubbleSort(data);
        System.out.println("Sorted: " + Arrays.toString(data));
        int pos = binarySearch(data, 42);
        System.out.println("Position of 42: " + pos);
        System.out.println("GCD: " + gcd(48, 18));
    }
}
